import { assessExposure } from "./exposure";
import { assessSettings, type SettingsAssessment } from "./edge";
import { roundTripCost } from "./fees";
import { sizePosition } from "./sizing";
import type { Side, VenueFees } from "./types";
import { alignSizeDown, type PerpAccountState, type PerpMarketMeta } from "./venue";

/**
 * La double serrure.
 *
 * `enabled` dit si le système a le droit d'exister ; `mode` dit s'il a le
 * droit d'agir. Les deux sont indépendants et les deux doivent être ouverts
 * pour qu'un ordre parte. En mode fantôme, tout est calculé et journalisé,
 * mais rien n'est envoyé — c'est ainsi qu'on mesure un bord avant de le
 * parier, plutôt que l'inverse.
 *
 * Aucune fonction de ce fichier n'envoie quoi que ce soit. Elle rend un
 * verdict ; c'est l'appelant qui décide quoi en faire, et lui seul a accès
 * au réseau.
 */

export type PerpsMode = "shadow" | "armed";

export interface PerpsSettings {
  /** Interrupteur général. Faux = le worker ne calcule même pas. */
  readonly enabled: boolean;
  /** Deuxième serrure. `armed` est le seul mode qui envoie des ordres. */
  readonly mode: PerpsMode;
  /** Part du capital risquée par trade. 0.005 = 0,5 %. */
  readonly riskFraction: number;
  /** Plafond de levier de l'application, par position. */
  readonly maxLeverage: number;
  /** Plafond du levier agrégé : somme des notionnels ÷ capital. */
  readonly maxTotalLeverage: number;
  readonly maxOpenPositions: number;
  /** Nombre de trades autorisés par jour. */
  readonly maxTradesPerDay: number;
  /** Budget de frais quotidien, en fraction du capital. */
  readonly maxDailyCostFraction: number;
  /** Coupe-circuit : perte réalisée du jour au-delà de laquelle on s'arrête. */
  readonly dailyLossLimitFraction: number;
  /** La liquidation doit être au moins k fois plus loin que le stop. */
  readonly liquidationBuffer: number;
  /** Trades mesurés exigés avant d'accorder du crédit à un bord. */
  readonly minSampleSize: number;
}

/**
 * Réglages par défaut, volontairement timides. Ils ne sont pas un conseil :
 * ils sont le point de départ le moins susceptible de vider un compte
 * pendant qu'on mesure.
 */
export function perpsDefaults(): PerpsSettings {
  return {
    enabled: false,
    mode: "shadow",
    riskFraction: 0.005,
    maxLeverage: 3,
    maxTotalLeverage: 3,
    maxOpenPositions: 3,
    maxTradesPerDay: 6,
    maxDailyCostFraction: 0.02,
    dailyLossLimitFraction: 0.03,
    liquidationBuffer: 2.5,
    minSampleSize: 100,
  };
}

/** Ce que la journée a déjà consommé. */
export interface DayState {
  readonly tradesToday: number;
  readonly feesPaidTodayUsd: number;
  /** PnL réalisé du jour, en dollars. Négatif = perte. */
  readonly realizedPnlTodayUsd: number;
}

/** Une occasion, telle que le scanner la propose. */
export interface TradeCandidate {
  readonly symbol: string;
  readonly side: Side;
  readonly entryPrice: number;
  readonly stopPrice: number;
  /** Bord brut moyen mesuré sur ce type de détection, en fraction. */
  readonly measuredGrossEdge: number;
  /** Nombre de détections derrière ce chiffre. */
  readonly sampleSize: number;
}

export type PerpsRefusal =
  | "perte_du_jour_atteinte"
  | "budget_de_frais_epuise"
  | "cadence_depassee"
  | "bord_insuffisant"
  | "dimensionnement_refuse"
  | "sous_le_minimum_apres_alignement"
  | "exposition_refusee"
  | "marge_insuffisante"
  | "deja_en_position";

/** Pourquoi un trade accepté n'est quand même pas envoyé. */
export type PerpsHold = "desactive" | "mode_fantome";

export interface TradePlan {
  readonly symbol: string;
  readonly side: Side;
  /** Taille alignée sur le pas de la plateforme. */
  readonly size: number;
  readonly notionalUsd: number;
  /** Levier entier à régler chez la plateforme. */
  readonly leverageToSet: number;
  /** Levier effectif réel : notionnel ÷ capital. */
  readonly effectiveLeverage: number;
  readonly marginUsd: number;
  readonly entryPrice: number;
  readonly stopPrice: number;
  readonly liquidationPrice: number;
  readonly riskUsd: number;
  /** Coût estimé de l'aller-retour, en dollars. */
  readonly estimatedRoundTripUsd: number;
}

export interface TradeVerdict {
  /** Vrai si la politique prendrait ce trade. */
  readonly allowed: boolean;
  /** Vrai seulement si, en plus, les deux serrures sont ouvertes. */
  readonly execute: boolean;
  readonly mode: PerpsMode;
  /** Présent dès que le dimensionnement a abouti, même si le trade est refusé. */
  readonly plan?: TradePlan | undefined;
  readonly refusals: readonly PerpsRefusal[];
  /** Ce qui retient un trade accepté. Vide quand `execute` est vrai. */
  readonly holds: readonly PerpsHold[];
  readonly reasons: readonly string[];
  readonly assessment: SettingsAssessment;
  /**
   * Coût d'un aller-retour retenu pour le seuil, en fraction du notionnel
   * DU PLAN. Sur une plateforme qui facture du gaz, ce chiffre monte quand
   * la position rapetisse — c'est voulu.
   */
  readonly roundTripFraction: number;
}

export interface EvaluateInputs {
  readonly settings: PerpsSettings;
  readonly fees: VenueFees;
  readonly market: PerpMarketMeta;
  readonly account: PerpAccountState;
  readonly day: DayState;
  readonly candidate: TradeCandidate;
  /** Glissement supposé par côté, en fraction. Mieux vaut le surestimer. */
  readonly assumedSlippagePerSide: number;
  /** Funding supposé payé sur la durée d'un trade, en fraction du notionnel. */
  readonly assumedFundingPerTrade: number;
}

/**
 * Le verdict complet sur une occasion.
 *
 * Tout est calculé, même quand une serrure est fermée : c'est ce calcul,
 * journalisé jour après jour, qui dira si le bord existe. Un système qui ne
 * calcule rien tant qu'il n'est pas armé n'apprend jamais rien.
 */
export function evaluateTrade(inputs: EvaluateInputs): TradeVerdict {
  const {
    settings,
    fees,
    market,
    account,
    day,
    candidate,
    assumedSlippagePerSide,
    assumedFundingPerTrade,
  } = inputs;

  const costAt = (notionalUsd: number, venueFees = fees): number =>
    roundTripCost(
      {
        notionalUsd,
        entryIsTaker: true,
        exitIsTaker: true,
        slippagePerSide: assumedSlippagePerSide,
        fundingPaid: assumedFundingPerTrade,
      },
      venueFees,
    ).totalUsd;

  // La part proportionnelle, mesurée sur un notionnel de 1 avec le frais
  // fixe neutralisé : sur 1 $, le total EST la fraction. Elle ne sert que
  // de repli quand aucun plan n'a pu être dimensionné — divisé par 1, un
  // frais fixe donnerait un pourcentage absurde.
  const proportionalFraction = costAt(1, { ...fees, fixedCostUsdPerSide: 0 });

  const refusals: PerpsRefusal[] = [];
  const reasons: string[] = [];

  const sizing = sizePosition({
    equityUsd: account.equityUsd,
    riskFraction: settings.riskFraction,
    entryPrice: candidate.entryPrice,
    stopPrice: candidate.stopPrice,
    side: candidate.side,
    maxLeverage: settings.maxLeverage,
    venueMaxLeverage: market.maxLeverage,
    minOrderValueUsd: market.minOrderValueUsd,
    liquidationBuffer: settings.liquidationBuffer,
    maintenanceMarginFraction: market.maintenanceMarginFraction,
  });

  let plan: TradePlan | undefined;

  if (!sizing.ok) {
    refusals.push("dimensionnement_refuse");
    reasons.push(`dimensionnement : ${sizing.detail}`);
  } else {
    const size = alignSizeDown(sizing.qty, market.quantityStep);
    const notionalUsd = size * candidate.entryPrice;

    if (size <= 0 || notionalUsd < market.minOrderValueUsd) {
      refusals.push("sous_le_minimum_apres_alignement");
      reasons.push(
        `taille alignée ${size} → ${notionalUsd.toFixed(2)} $, sous le minimum de ${market.minOrderValueUsd} $`,
      );
    }

    const leverageCap = Math.floor(Math.min(settings.maxLeverage, market.maxLeverage));
    const leverageToSet = Math.min(
      Math.max(1, Math.ceil(sizing.leverage)),
      Math.max(1, leverageCap),
    );
    const marginUsd = leverageToSet > 0 ? notionalUsd / leverageToSet : notionalUsd;

    plan = {
      symbol: candidate.symbol,
      side: candidate.side,
      size,
      notionalUsd,
      leverageToSet,
      effectiveLeverage: account.equityUsd > 0 ? notionalUsd / account.equityUsd : 0,
      marginUsd,
      entryPrice: candidate.entryPrice,
      stopPrice: candidate.stopPrice,
      liquidationPrice: sizing.liquidationPrice,
      riskUsd: size * Math.abs(candidate.entryPrice - candidate.stopPrice),
      // Au notionnel réel, pas extrapolé : c'est là que le frais fixe se
      // fait sentir, et il ne se laisse pas mettre en pourcentage.
      estimatedRoundTripUsd: costAt(notionalUsd),
    };

    if (marginUsd > account.availableMarginUsd) {
      refusals.push("marge_insuffisante");
      reasons.push(
        `marge requise ${marginUsd.toFixed(2)} $ contre ${account.availableMarginUsd.toFixed(2)} $ disponibles`,
      );
    }

    const exposure = assessExposure({
      equityUsd: account.equityUsd,
      openNotionalsUsd: account.positions.map((p) => p.notionalUsd),
      newNotionalUsd: notionalUsd,
      maxTotalLeverage: settings.maxTotalLeverage,
      maxOpenPositions: settings.maxOpenPositions,
    });
    if (!exposure.ok) {
      refusals.push("exposition_refusee");
      reasons.push(`exposition : ${exposure.detail ?? exposure.reason ?? "refusée"}`);
    }
  }

  if (account.positions.some((p) => p.symbol === candidate.symbol)) {
    refusals.push("deja_en_position");
    reasons.push(`une position est déjà ouverte sur ${candidate.symbol}`);
  }

  if (day.tradesToday >= settings.maxTradesPerDay) {
    refusals.push("cadence_depassee");
    reasons.push(
      `${day.tradesToday} trades aujourd'hui, plafond ${settings.maxTradesPerDay}`,
    );
  }

  const feeBudgetUsd = account.equityUsd * settings.maxDailyCostFraction;
  const feesAfterUsd = day.feesPaidTodayUsd + (plan?.estimatedRoundTripUsd ?? 0);
  if (feesAfterUsd > feeBudgetUsd) {
    refusals.push("budget_de_frais_epuise");
    reasons.push(
      `frais du jour ${feesAfterUsd.toFixed(2)} $ au-delà du budget ${feeBudgetUsd.toFixed(2)} $`,
    );
  }

  const lossLimitUsd = account.equityUsd * settings.dailyLossLimitFraction;
  if (day.realizedPnlTodayUsd <= -lossLimitUsd && lossLimitUsd > 0) {
    refusals.push("perte_du_jour_atteinte");
    reasons.push(
      `perte du jour ${day.realizedPnlTodayUsd.toFixed(2)} $, limite ${(-lossLimitUsd).toFixed(2)} $`,
    );
  }

  // Le seuil à battre est le coût de CE trade, pas d'un trade générique.
  const roundTripFraction =
    plan !== undefined && plan.notionalUsd > 0
      ? plan.estimatedRoundTripUsd / plan.notionalUsd
      : proportionalFraction;

  const assessment = assessSettings({
    tradesPerDay: settings.maxTradesPerDay,
    effectiveLeverage: plan?.effectiveLeverage ?? 0,
    roundTripFraction,
    measuredGrossEdge: candidate.measuredGrossEdge,
    sampleSize: candidate.sampleSize,
    minSampleSize: settings.minSampleSize,
  });
  if (!assessment.viable) {
    refusals.push("bord_insuffisant");
  }
  reasons.push(...assessment.reasons);

  const holds: PerpsHold[] = [];
  if (!settings.enabled) holds.push("desactive");
  if (settings.mode !== "armed") holds.push("mode_fantome");

  const allowed = refusals.length === 0;

  return {
    allowed,
    execute: allowed && holds.length === 0,
    mode: settings.mode,
    plan,
    refusals,
    holds,
    reasons,
    assessment,
    roundTripFraction,
  };
}

/**
 * L'armement est une décision, pas une case à cocher. Cette fonction dit à
 * quelles conditions le passage en `armed` est légitime ; les routes API s'en
 * servent pour refuser un armement demandé sur la foi d'une intuition.
 */
export interface ArmingCheck {
  readonly ok: boolean;
  readonly blockers: readonly string[];
}

export interface ArmingInputs {
  /** L'appelant a explicitement confirmé, en toutes lettres. */
  readonly confirmed: boolean;
  /** Décisions fantômes accumulées depuis l'activation. */
  readonly shadowDecisions: number;
  /** Décisions fantômes exigées avant d'armer. */
  readonly minShadowDecisions: number;
  /** Le bord mesuré sur ces décisions, en fraction du notionnel. */
  readonly measuredGrossEdge: number;
  /** Le seuil à franchir : le coût d'un aller-retour. */
  readonly roundTripFraction: number;
  /** Vrai si les secrets de la plateforme sont présents. */
  readonly credentialsPresent: boolean;
}

export function canArm(inputs: ArmingInputs): ArmingCheck {
  const blockers: string[] = [];

  if (!inputs.confirmed) {
    blockers.push("armement non confirmé explicitement");
  }
  if (!inputs.credentialsPresent) {
    blockers.push("identifiants de la plateforme absents");
  }
  if (inputs.shadowDecisions < inputs.minShadowDecisions) {
    blockers.push(
      `${inputs.shadowDecisions} décisions en mode fantôme, ${inputs.minShadowDecisions} exigées`,
    );
  }
  if (inputs.measuredGrossEdge <= inputs.roundTripFraction) {
    blockers.push(
      `bord mesuré ${(inputs.measuredGrossEdge * 100).toFixed(3)} % sous le coût de ${(inputs.roundTripFraction * 100).toFixed(3)} %`,
    );
  }

  return { ok: blockers.length === 0, blockers };
}
