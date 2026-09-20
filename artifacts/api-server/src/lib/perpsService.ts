import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import {
  db,
  perpsDecisionsTable,
  perpsOrdersTable,
  perpsPositionsTable,
  perpsSettingsTable,
} from "@workspace/db";
import {
  canArm,
  evaluateTrade,
  isVenueId,
  perpsDefaults,
  roundTripCost,
  venueFeesWithOverrides,
  type ArmingCheck,
  type DayState,
  type PerpMarketMeta,
  type PerpAccountState,
  type PerpsSettings,
  type PerpsVenue,
  type TradeCandidate,
  type TradeVerdict,
  type VenueFees,
  type VenueId,
} from "@workspace/perps";
import { venueAdapter } from "./perpsVenueRegistry";
import { logger } from "./logger";

/**
 * La colle entre la politique et le monde.
 *
 * `@workspace/perps` décide ; ce fichier va chercher les chiffres en base et
 * chez la plateforme, puis écrit ce qui s'est passé. Il n'invente aucune
 * règle : quand une décision est refusée ici, c'est toujours la politique
 * qui l'a refusée.
 */

export const DEFAULT_VENUE: VenueId = "hyperliquid";

/**
 * La plateforme demandée, ou la plateforme par défaut.
 *
 * Refuse plutôt que de retomber silencieusement sur Hyperliquid : une faute
 * de frappe qui ferait passer un ordre GMX par Hyperliquid n'est pas une
 * erreur qu'on veut découvrir après coup.
 */
export function asVenueId(value: string | undefined | null): VenueId {
  if (value === undefined || value === null || value === "") return DEFAULT_VENUE;
  if (!isVenueId(value)) throw new Error(`Plateforme inconnue : ${value}`);
  return value;
}

/** Le marché supposé en mode fantôme, quand aucun compte n'est branché. */
const SHADOW_MARKET: PerpMarketMeta = {
  symbol: "",
  maxLeverage: 20,
  quantityStep: 0.0001,
  priceStep: 0.01,
  minOrderValueUsd: 10,
  maintenanceMarginFraction: 0.025,
};

export interface PerpsConfig extends PerpsSettings {
  readonly venue: VenueId;
  readonly minShadowDecisions: number;
  readonly assumedSlippagePerSide: number;
  readonly assumedFundingPerTrade: number;
  /**
   * Le frais fixe supposé par côté, en dollars.
   *
   * Nul sur une plateforme centralisée. Sur GMX c'est le gaz du keeper, et
   * c'est le réglage qui pèse le plus lourd sur une petite position : à
   * 0,50 $ par côté, une position de 40 $ paie 2,5 % avant tout le reste.
   * `measureFixedCostUsd` du registre le remplace par un chiffre observé.
   */
  readonly assumedFixedCostUsd: number;
  readonly shadowEquityUsd: number;
  readonly armedAt: Date | null;
  readonly disarmedAt: Date | null;
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Le début de la journée courante, en heure du serveur. */
export function startOfToday(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Lit les réglages. En l'absence de ligne, rend les défauts fermés plutôt
 * que d'en créer une : un système de trading ne s'auto-installe pas.
 */
export async function loadConfig(
  venueId: string = DEFAULT_VENUE,
): Promise<PerpsConfig> {
  const venue = asVenueId(venueId);
  const rows = await db
    .select()
    .from(perpsSettingsTable)
    .where(eq(perpsSettingsTable.venue, venue))
    .limit(1);

  const defaults = perpsDefaults();
  const row = rows[0];
  if (!row) {
    return {
      ...defaults,
      venue,
      minShadowDecisions: 200,
      assumedSlippagePerSide: 0.0002,
      assumedFundingPerTrade: 0.0005,
      // Le barème de la plateforme, tant que rien n'a été mesuré.
      assumedFixedCostUsd: venueFeesWithOverrides(venue).fixedCostUsdPerSide,
      shadowEquityUsd: 1000,
      armedAt: null,
      disarmedAt: null,
    };
  }

  return {
    venue,
    enabled: row.enabled,
    mode: row.mode === "armed" ? "armed" : "shadow",
    riskFraction: toNumber(row.riskFraction, defaults.riskFraction),
    maxLeverage: toNumber(row.maxLeverage, defaults.maxLeverage),
    maxTotalLeverage: toNumber(row.maxTotalLeverage, defaults.maxTotalLeverage),
    maxOpenPositions: row.maxOpenPositions,
    maxTradesPerDay: row.maxTradesPerDay,
    maxDailyCostFraction: toNumber(row.maxDailyCostFraction, defaults.maxDailyCostFraction),
    dailyLossLimitFraction: toNumber(
      row.dailyLossLimitFraction,
      defaults.dailyLossLimitFraction,
    ),
    liquidationBuffer: toNumber(row.liquidationBuffer, defaults.liquidationBuffer),
    minSampleSize: row.minSampleSize,
    minShadowDecisions: row.minShadowDecisions,
    assumedSlippagePerSide: toNumber(row.assumedSlippagePerSide, 0.0002),
    assumedFundingPerTrade: toNumber(row.assumedFundingPerTrade, 0.0005),
    assumedFixedCostUsd: toNumber(
      row.assumedFixedCostUsd,
      venueFeesWithOverrides(venue).fixedCostUsdPerSide,
    ),
    shadowEquityUsd: toNumber(row.shadowEquityUsd, 1000),
    armedAt: row.armedAt,
    disarmedAt: row.disarmedAt,
  };
}

/** Le barème de la plateforme, avec le frais fixe mesuré substitué. */
export function configuredFees(config: PerpsConfig): VenueFees {
  return venueFeesWithOverrides(config.venue, {
    fixedCostUsdPerSide: config.assumedFixedCostUsd,
  });
}

/**
 * La taille à laquelle on compare un coût à un bord.
 *
 * Sur une plateforme sans frais fixe, la question ne se pose pas : le coût
 * est le même en pourcentage à toutes les tailles. Dès qu'un frais fixe
 * existe, il faut dire de QUELLE taille on parle, sinon « le coût » n'a
 * pas de valeur.
 *
 * On prend le notionnel que la politique dimensionnerait vraiment : le
 * capital, la fraction de risque, et le stop de l'enveloppe du scanner.
 */
export const REFERENCE_STOP_FRACTION = 0.12;

export function referenceNotionalUsd(
  config: PerpsConfig,
  equityUsd = config.shadowEquityUsd,
): number {
  const capital = equityUsd > 0 ? equityUsd : config.shadowEquityUsd;
  const notional = (capital * config.riskFraction) / REFERENCE_STOP_FRACTION;
  return notional > 0 ? notional : 1;
}

/**
 * Le coût d'un aller-retour retenu par ces réglages, en fraction.
 *
 * Le notionnel n'est pas décoratif : c'est lui qui dilue — ou pas — le frais
 * fixe. Le même réglage GMX donne 24 % à 4 $ de notionnel et 0,24 % à 833 $.
 */
export function configuredRoundTripFraction(
  config: PerpsConfig,
  notionalUsd = referenceNotionalUsd(config),
): number {
  return roundTripCost(
    {
      notionalUsd,
      entryIsTaker: true,
      exitIsTaker: true,
      slippagePerSide: config.assumedSlippagePerSide,
      fundingPaid: config.assumedFundingPerTrade,
    },
    configuredFees(config),
  ).totalFraction;
}

/** Ce que la journée a déjà consommé, lu en base. */
export async function loadDayState(
  venue: string = DEFAULT_VENUE,
  now: Date = new Date(),
): Promise<DayState> {
  const since = startOfToday(now);

  const [executed] = await db
    .select({
      trades: count(),
      fees: sql<string>`coalesce(sum(${perpsDecisionsTable.estimatedRoundTripUsd}), 0)`,
    })
    .from(perpsDecisionsTable)
    .where(
      and(
        eq(perpsDecisionsTable.venue, venue),
        eq(perpsDecisionsTable.executed, true),
        gte(perpsDecisionsTable.createdAt, since),
      ),
    );

  const [closed] = await db
    .select({
      pnl: sql<string>`coalesce(sum(${perpsPositionsTable.realizedPnlUsd}), 0)`,
    })
    .from(perpsPositionsTable)
    .where(
      and(
        eq(perpsPositionsTable.venue, venue),
        isNotNull(perpsPositionsTable.closedAt),
        gte(perpsPositionsTable.closedAt, since),
      ),
    );

  return {
    tradesToday: executed?.trades ?? 0,
    feesPaidTodayUsd: toNumber(executed?.fees, 0),
    realizedPnlTodayUsd: toNumber(closed?.pnl, 0),
  };
}

export interface EvaluationContext {
  readonly config: PerpsConfig;
  readonly account: PerpAccountState;
  readonly market: PerpMarketMeta;
  readonly day: DayState;
  /** Absent quand aucun compte n'est configuré. */
  readonly venue: PerpsVenue | null;
}

/**
 * Rassemble l'état nécessaire pour juger une occasion.
 *
 * Sans compte branché, on reste en mode fantôme avec un capital de
 * référence et un marché supposé. C'est explicitement une supposition —
 * elle sert à mesurer un bord, jamais à parier.
 */
export async function buildContext(
  symbol: string,
  options: { venue?: PerpsVenue | null; venueId?: string; now?: Date } = {},
): Promise<EvaluationContext> {
  const config = await loadConfig(options.venueId ?? DEFAULT_VENUE);
  const day = await loadDayState(config.venue, options.now);

  const venue =
    options.venue !== undefined
      ? options.venue
      : venueAdapter(config.venue).create();

  if (!venue) {
    return {
      config,
      day,
      venue: null,
      account: {
        equityUsd: config.shadowEquityUsd,
        availableMarginUsd: config.shadowEquityUsd,
        positions: [],
      },
      market: { ...SHADOW_MARKET, symbol },
    };
  }

  const [account, market] = await Promise.all([
    venue.getAccountState(),
    venue.getMarketMeta(symbol),
  ]);
  return { config, day, venue, account, market };
}

/** Le verdict, sans effet de bord. */
export function judge(
  context: EvaluationContext,
  candidate: TradeCandidate,
): TradeVerdict {
  return evaluateTrade({
    settings: context.config,
    fees: configuredFees(context.config),
    market: context.market,
    account: context.account,
    day: context.day,
    candidate,
    assumedSlippagePerSide: context.config.assumedSlippagePerSide,
    assumedFundingPerTrade: context.config.assumedFundingPerTrade,
  });
}

function asNumeric(value: number | undefined): string | null {
  return value === undefined || !Number.isFinite(value) ? null : String(value);
}

/** Écrit la décision et rend son identifiant. */
export async function recordDecision(
  context: EvaluationContext,
  candidate: TradeCandidate,
  verdict: TradeVerdict,
  executed: boolean,
): Promise<number | null> {
  const plan = verdict.plan;
  const [row] = await db
    .insert(perpsDecisionsTable)
    .values({
      venue: context.config.venue,
      symbol: candidate.symbol,
      side: candidate.side,
      mode: verdict.mode,
      allowed: verdict.allowed,
      executed,
      refusals: JSON.stringify(verdict.refusals),
      holds: JSON.stringify(verdict.holds),
      reasons: JSON.stringify(verdict.reasons),
      entryPrice: String(candidate.entryPrice),
      stopPrice: String(candidate.stopPrice),
      size: asNumeric(plan?.size),
      notionalUsd: asNumeric(plan?.notionalUsd),
      leverageToSet: plan?.leverageToSet ?? null,
      effectiveLeverage: asNumeric(plan?.effectiveLeverage),
      liquidationPrice: asNumeric(plan?.liquidationPrice),
      riskUsd: asNumeric(plan?.riskUsd),
      estimatedRoundTripUsd: asNumeric(plan?.estimatedRoundTripUsd),
      roundTripFraction: String(verdict.roundTripFraction),
      measuredGrossEdge: String(candidate.measuredGrossEdge),
      sampleSize: candidate.sampleSize,
      equityUsd: String(context.account.equityUsd),
    })
    .returning({ id: perpsDecisionsTable.id });

  return row?.id ?? null;
}

export interface HandleResult {
  readonly verdict: TradeVerdict;
  readonly decisionId: number | null;
  readonly executed: boolean;
  readonly error?: string;
}

/**
 * Le chemin complet : juger, journaliser, et n'exécuter que si les deux
 * serrures sont ouvertes.
 *
 * L'ordre compte. La décision est écrite AVANT l'envoi : si le processus
 * meurt entre les deux, il reste une trace de ce qui allait partir. Une
 * décision journalisée sans ordre se rattrape ; un ordre sans trace, non.
 */
export async function handleCandidate(
  candidate: TradeCandidate,
  options: { venue?: PerpsVenue | null; venueId?: string; now?: Date } = {},
): Promise<HandleResult> {
  const context = await buildContext(candidate.symbol, options);
  const verdict = judge(context, candidate);

  if (!verdict.execute || !context.venue || !verdict.plan) {
    const decisionId = await recordDecision(context, candidate, verdict, false);
    return { verdict, decisionId, executed: false };
  }

  const decisionId = await recordDecision(context, candidate, verdict, false);
  const plan = verdict.plan;
  const clientOrderId = `perps-${decisionId ?? Date.now()}-${candidate.symbol}`;

  try {
    const result = await context.venue.placeOrder({
      symbol: plan.symbol,
      side: plan.side,
      size: plan.size,
      type: "market",
      leverage: plan.leverageToSet,
      clientOrderId,
      limitPrice: plan.entryPrice,
      stopLossPrice: plan.stopPrice,
    });

    const [orderRow] = await db
      .insert(perpsOrdersTable)
      .values({
        venue: context.config.venue,
        clientOrderId,
        venueOrderId: result.venueOrderId,
        decisionId,
        symbol: plan.symbol,
        side: plan.side,
        type: "market",
        size: String(plan.size),
        leverage: plan.leverageToSet,
        limitPrice: String(plan.entryPrice),
        stopLossPrice: String(plan.stopPrice),
        status: result.status,
        filledSize: String(result.filledSize),
        averagePrice: asNumeric(result.averagePrice),
        raw: JSON.stringify(result.raw ?? null),
      })
      .returning({ id: perpsOrdersTable.id });

    if (decisionId !== null) {
      await db
        .update(perpsDecisionsTable)
        .set({ executed: true, orderId: orderRow?.id ?? null })
        .where(eq(perpsDecisionsTable.id, decisionId));
    }

    return { verdict, decisionId, executed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ symbol: candidate.symbol, clientOrderId }, "perps: ordre refuse");

    await db.insert(perpsOrdersTable).values({
      venue: context.config.venue,
      clientOrderId,
      decisionId,
      symbol: plan.symbol,
      side: plan.side,
      type: "market",
      size: String(plan.size),
      leverage: plan.leverageToSet,
      status: "rejected",
      error: message,
    });

    return { verdict, decisionId, executed: false, error: message };
  }
}

export interface ArmingStatus extends ArmingCheck {
  readonly shadowDecisions: number;
  readonly minShadowDecisions: number;
  readonly measuredGrossEdge: number;
  readonly roundTripFraction: number;
  readonly credentialsPresent: boolean;
  /** Adresse publique du compte, quand elle est connue. Jamais la clé. */
  readonly walletAddress: string | null;
  readonly venue: VenueId;
  readonly venueLabel: string;
  /** La taille à laquelle `roundTripFraction` a été calculé. */
  readonly referenceNotionalUsd: number;
  readonly assumedFixedCostUsd: number;
}

/**
 * Où en est-on par rapport à l'armement.
 *
 * Le bord retenu est celui réellement constaté sur les décisions fantômes
 * dont l'issue a été mesurée, pas celui espéré au moment de la détection.
 */
export async function armingStatus(
  confirmed = false,
  venueId: string = DEFAULT_VENUE,
): Promise<ArmingStatus> {
  const config = await loadConfig(venueId);
  const adapter = venueAdapter(config.venue);
  const referenceNotional = referenceNotionalUsd(config);
  const roundTripFraction = configuredRoundTripFraction(config, referenceNotional);

  const [stats] = await db
    .select({
      total: count(),
      edge: sql<string>`coalesce(avg(${perpsDecisionsTable.realizedGrossEdge}), 0)`,
    })
    .from(perpsDecisionsTable)
    .where(
      and(
        eq(perpsDecisionsTable.venue, config.venue),
        eq(perpsDecisionsTable.allowed, true),
        isNotNull(perpsDecisionsTable.realizedGrossEdge),
      ),
    );

  const shadowDecisions = stats?.total ?? 0;
  const measuredGrossEdge = toNumber(stats?.edge, 0);
  const credentialsPresent = adapter.credentialsPresent();

  const check = canArm({
    confirmed,
    shadowDecisions,
    minShadowDecisions: config.minShadowDecisions,
    measuredGrossEdge,
    roundTripFraction,
    credentialsPresent,
  });

  return {
    ...check,
    shadowDecisions,
    minShadowDecisions: config.minShadowDecisions,
    measuredGrossEdge,
    roundTripFraction,
    credentialsPresent,
    walletAddress: adapter.publicAddress(),
    venue: config.venue,
    venueLabel: adapter.label,
    referenceNotionalUsd: referenceNotional,
    assumedFixedCostUsd: config.assumedFixedCostUsd,
  };
}

/** Les dernières décisions, pour la page et pour l'inspection. */
export async function recentDecisions(
  limit = 50,
  venueId?: string,
): Promise<unknown[]> {
  const rows = db
    .select()
    .from(perpsDecisionsTable)
    .orderBy(desc(perpsDecisionsTable.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));

  if (venueId === undefined) return rows;
  return db
    .select()
    .from(perpsDecisionsTable)
    .where(eq(perpsDecisionsTable.venue, asVenueId(venueId)))
    .orderBy(desc(perpsDecisionsTable.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

/**
 * Compare les deux plateformes sur les mêmes réglages.
 *
 * C'est la réponse chiffrée à « laquelle vaut le coup ? », et elle dépend
 * entièrement de la taille : à 1 000 $ de capital GMX coûte une trentaine de
 * fois Hyperliquid, à 20 000 $ environ trois fois.
 */
export interface VenueComparisonRow {
  readonly venue: VenueId;
  readonly label: string;
  readonly roundTripFraction: number;
  readonly notionalUsd: number;
  readonly fixedCostUsdPerSide: number;
  readonly credentialsPresent: boolean;
  /** Trades par jour tenables sous le budget de frais. */
  readonly maxTradesUnderBudget: number;
}

export async function compareVenues(
  equityUsd?: number,
): Promise<readonly VenueComparisonRow[]> {
  const out: VenueComparisonRow[] = [];
  for (const adapter of [venueAdapter("hyperliquid"), venueAdapter("gmx")]) {
    const config = await loadConfig(adapter.id);
    const notionalUsd = referenceNotionalUsd(config, equityUsd ?? config.shadowEquityUsd);
    const roundTripFraction = configuredRoundTripFraction(config, notionalUsd);
    const capital = equityUsd ?? config.shadowEquityUsd;
    // Le budget est une part du CAPITAL ; le coût, une part du NOTIONNEL.
    const costPerTradeUsd = roundTripFraction * notionalUsd;
    out.push({
      venue: adapter.id,
      label: adapter.label,
      roundTripFraction,
      notionalUsd,
      fixedCostUsdPerSide: config.assumedFixedCostUsd,
      credentialsPresent: adapter.credentialsPresent(),
      maxTradesUnderBudget:
        costPerTradeUsd > 0
          ? Math.floor((capital * config.maxDailyCostFraction) / costPerTradeUsd)
          : 0,
    });
  }
  return out;
}
