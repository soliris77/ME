/**
 * Le bord requis — la partie qui répond à « combien de trades ? ».
 *
 * L'intuition « plus de trades = plus de gains » est fausse dans un sens
 * précis : le nombre de trades multiplie l'espérance par trade. Les coûts,
 * eux, sont certains. Si l'espérance brute ne dépasse pas le coût, augmenter
 * le rythme ne fait qu'accélérer la perte — et la rend plus certaine, parce
 * que la loi des grands nombres joue alors contre toi.
 *
 * Ce module ne donne pas d'avis. Il donne le seuil à franchir.
 */

/**
 * Coût quotidien, en fraction du capital.
 *
 *   coût/jour = N × L × coût par aller-retour
 *
 * L est le levier EFFECTIF : notionnel moyen par trade ÷ capital. Une position
 * qui engage tout le compte à 5× donne L = 5 ; un cinquième du compte à 5×
 * donne L = 1. C'est ce qui rend le résultat indépendant de la taille du
 * compte — 100 $ ou 300 $ perdent le même pourcentage par jour.
 */
export function dailyCostFraction(
  tradesPerDay: number,
  effectiveLeverage: number,
  roundTripFraction: number,
): number {
  return tradesPerDay * effectiveLeverage * roundTripFraction;
}

/**
 * Le bord brut minimum par trade, en fraction du notionnel, pour être à
 * l'équilibre. C'est exactement le coût de l'aller-retour : il faut capturer
 * au moins ce que le passage coûte.
 */
export function breakEvenEdge(roundTripFraction: number): number {
  return roundTripFraction;
}

export interface ExpectancyInputs {
  /** Proportion de trades gagnants, entre 0 et 1. */
  readonly winRate: number;
  /** Gain brut moyen d'un trade gagnant, en fraction du notionnel. */
  readonly avgWin: number;
  /** Perte brute moyenne d'un trade perdant, en fraction du notionnel. Positive. */
  readonly avgLoss: number;
  /** Coût d'un aller-retour, en fraction du notionnel. */
  readonly roundTripFraction: number;
}

/** Espérance nette par trade, en fraction du notionnel. Négative = fuite. */
export function netExpectancy(inputs: ExpectancyInputs): number {
  const { winRate, avgWin, avgLoss, roundTripFraction } = inputs;
  const gross = winRate * avgWin - (1 - winRate) * avgLoss;
  return gross - roundTripFraction;
}

export interface SettingsAssessment {
  /** Vrai seulement si le bord mesuré dépasse le bord requis. */
  readonly viable: boolean;
  /** Ce qu'il faut capturer par trade, en fraction du notionnel. */
  readonly requiredEdge: number;
  /** Ce que les données mesurées donnent, en fraction du notionnel. */
  readonly measuredEdge: number;
  /** Coût quotidien en fraction du capital, à ce rythme et ce levier. */
  readonly dailyCostFraction: number;
  /** Espérance nette quotidienne en fraction du capital. Négative = fuite. */
  readonly dailyNetFraction: number;
  /** Pourquoi, en clair. */
  readonly reasons: readonly string[];
}

export interface AssessInputs {
  readonly tradesPerDay: number;
  readonly effectiveLeverage: number;
  readonly roundTripFraction: number;
  /**
   * Bord brut moyen par trade, mesuré — pas espéré. Vient de l'évaluateur
   * d'horizons : le rendement dirigé moyen des détections, frais exclus.
   */
  readonly measuredGrossEdge: number;
  /**
   * Nombre de trades mesurés derrière ce chiffre. Sous ce seuil, une moyenne
   * ne veut rien dire — quelques coups de chance la portent entièrement.
   */
  readonly sampleSize: number;
  /** Taille d'échantillon minimale exigée avant d'accorder du crédit au bord. */
  readonly minSampleSize?: number;
}

const DEFAULT_MIN_SAMPLE = 100;

/**
 * Le verdict. Il ne dit pas « c'est une bonne idée » — il dit si, aux coûts
 * réels de la plateforme, ces réglages ont une chance arithmétique.
 */
export function assessSettings(inputs: AssessInputs): SettingsAssessment {
  const {
    tradesPerDay,
    effectiveLeverage,
    roundTripFraction,
    measuredGrossEdge,
    sampleSize,
    minSampleSize = DEFAULT_MIN_SAMPLE,
  } = inputs;

  const requiredEdge = breakEvenEdge(roundTripFraction);
  const netPerTrade = measuredGrossEdge - requiredEdge;
  const cost = dailyCostFraction(tradesPerDay, effectiveLeverage, roundTripFraction);
  const dailyNet = tradesPerDay * effectiveLeverage * netPerTrade;

  const reasons: string[] = [];

  if (sampleSize < minSampleSize) {
    reasons.push(
      `échantillon insuffisant : ${sampleSize} trades mesurés, ${minSampleSize} exigés`,
    );
  }
  if (measuredGrossEdge <= requiredEdge) {
    reasons.push(
      `bord mesuré ${(measuredGrossEdge * 100).toFixed(3)} % sous le seuil de ${(requiredEdge * 100).toFixed(3)} %`,
    );
  }
  if (cost >= 0.1) {
    reasons.push(
      `les frais seuls coûtent ${(cost * 100).toFixed(1)} % du capital par jour`,
    );
  }

  const viable = sampleSize >= minSampleSize && measuredGrossEdge > requiredEdge;
  if (viable) {
    reasons.push(
      `bord net ${(netPerTrade * 100).toFixed(3)} % par trade sur ${sampleSize} mesures`,
    );
  }

  return {
    viable,
    requiredEdge,
    measuredEdge: measuredGrossEdge,
    dailyCostFraction: cost,
    dailyNetFraction: dailyNet,
    reasons,
  };
}

/**
 * Le nombre de trades le plus élevé qui garde le coût quotidien sous un
 * plafond donné. Sert à répondre à « combien de trades puis-je faire ? »
 * par un nombre plutôt que par une intention.
 */
export function maxTradesPerDay(
  effectiveLeverage: number,
  roundTripFraction: number,
  maxDailyCostFraction: number,
): number {
  const perTrade = effectiveLeverage * roundTripFraction;
  if (perTrade <= 0) return 0;
  return Math.floor(maxDailyCostFraction / perTrade);
}
