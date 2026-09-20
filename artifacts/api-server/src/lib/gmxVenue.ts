import {
  type PerpAccountState,
  type PerpMarketMeta,
  type PerpOrderRequest,
  type PerpOrderResult,
  type PerpOrderStatus,
  type PerpPosition,
  type PerpsVenue,
} from "@workspace/perps";

/**
 * L'adaptateur GMX v2 (Arbitrum).
 *
 * Même rôle que `hyperliquidVenue.ts` : traduire, jamais décider. Toute la
 * politique reste dans `@workspace/perps`.
 *
 * Trois différences avec Hyperliquid comptent, et elles sont la raison
 * d'être de la moitié de ce fichier :
 *
 *   1. GMX est on-chain. Chaque ordre est une transaction, donc un coût en
 *      DOLLARS indépendant de la taille. Sur une position de 40 $, un gaz de
 *      1 $ est 2,5 % — vingt-cinq fois le coût du même aller-retour sur
 *      Hyperliquid. `assertExecutionFeeAcceptable` refuse l'ordre quand ce
 *      coût dépasse une part du notionnel, avant de rien envoyer.
 *   2. GMX ne connaît pas les identifiants d'ordre du client. Le
 *      `clientOrderId` ne fait pas l'aller-retour : on le renvoie tel qu'on
 *      l'a reçu, et l'identité côté plateforme est la clé d'ordre on-chain.
 *   3. La clé privée ici contrôle le PORTEFEUILLE ENTIER, pas un agent de
 *      trading comme sur Hyperliquid. Un portefeuille dédié, ne contenant
 *      que le capital de trading, n'est pas une précaution : c'est la seule
 *      configuration acceptable.
 *
 * SECRETS — la clé ne vient que de l'environnement. Elle n'est ni
 * journalisée, ni renvoyée, ni incluse dans un message d'erreur. Ce module
 * ne rend au reste de l'application qu'un booléen de présence et une adresse
 * publique.
 */

const VENUE_ID = "gmx";

/**
 * GMX n'impose aucun pas de quantité : les tailles sont des montants en
 * dollars à 30 décimales. Ce pas n'est donc pas une contrainte de la
 * plateforme, seulement la granularité à laquelle on arrondit.
 */
const QUANTITY_STEP = 1e-8;

/** Glissement toléré par défaut, en points de base. */
const DEFAULT_SLIPPAGE_BPS = 30;

/**
 * Part du notionnel au-delà de laquelle le gaz rend l'ordre absurde.
 *
 * 0,5 % par côté, soit 1 % l'aller-retour : c'est déjà cinq fois le coût
 * complet d'un aller-retour sur Hyperliquid. Au-delà, ce n'est plus un
 * trade, c'est un don au réseau.
 */
const DEFAULT_MAX_EXECUTION_FEE_FRACTION = 0.005;

type EnvLike = Record<string, string | undefined>;

export interface GmxCredentials {
  /** Adresse publique. Publique : elle peut être affichée. */
  readonly walletAddress: string;
  /** Clé privée du portefeuille. Ne sort jamais de ce module. */
  readonly privateKey: string;
}

/**
 * Lit les identifiants dans l'environnement. Rend `null` dès qu'il en manque
 * un — un compte à moitié configuré ne doit jamais tenter un ordre.
 */
export function readGmxCredentials(env: EnvLike = process.env): GmxCredentials | null {
  const walletAddress = (env.GMX_WALLET_ADDRESS ?? "").trim();
  const privateKey = (env.GMX_PRIVATE_KEY ?? "").trim();
  if (walletAddress === "" || privateKey === "") return null;
  return { walletAddress, privateKey };
}

/** Vrai si les deux secrets sont présents. Ne révèle rien d'autre. */
export function gmxCredentialsPresent(env: EnvLike = process.env): boolean {
  return readGmxCredentials(env) !== null;
}

/** L'adresse publique, pour l'affichage. Jamais la clé. */
export function gmxPublicAddress(env: EnvLike = process.env): string | null {
  return readGmxCredentials(env)?.walletAddress ?? null;
}

/* ----------------------------------------------------------------
   Le port vers la chaîne.

   Déclaré ici, implémenté dans `gmxChain.ts` par-dessus le SDK officiel.
   Les tests en passent un faux : tout ce fichier se vérifie sans réseau,
   sans clé et sans le moindre dollar.
   ---------------------------------------------------------------- */

export interface GmxMarketSnapshot {
  /** Symbole de l'actif suivi : « BTC », « ETH »… */
  readonly symbol: string;
  readonly marketTokenAddress: string;
  /** Vrai pour un marché au comptant : pas de levier, on l'ignore. */
  readonly isSpotOnly: boolean;
  readonly maxLeverage: number;
  /**
   * Collatéral minimal rapporté à la taille. C'est le seuil de liquidation
   * de GMX, donc exactement la fraction de marge de maintenance — pas besoin
   * ici de la règle 1/(2×levier) d'Hyperliquid.
   */
  readonly minCollateralFactor: number;
  readonly minPositionSizeUsd: number;
  readonly minCollateralUsd: number;
  readonly markPriceUsd: number;
  readonly priceStep: number;
}

export interface GmxPositionSnapshot {
  readonly key: string;
  readonly symbol: string;
  readonly isLong: boolean;
  readonly sizeUsd: number;
  readonly sizeInTokens: number;
  readonly collateralUsd: number;
  readonly entryPriceUsd: number;
  readonly markPriceUsd: number;
  /** `null` quand la plateforme ne le donne pas — ne jamais l'inventer. */
  readonly liquidationPriceUsd: number | null;
  readonly leverage: number;
  readonly unrealizedPnlUsd: number;
}

export interface GmxAccountBalances {
  readonly equityUsd: number;
  readonly availableMarginUsd: number;
}

export interface GmxOpenOrder {
  readonly key: string;
  readonly symbol: string;
  readonly isLong: boolean;
  readonly sizeDeltaUsd: number;
  readonly isDecrease: boolean;
  readonly raw: unknown;
}

/** Un ordre préparé, pas encore envoyé. Rien n'a été signé à ce stade. */
export interface GmxPreparedOrder {
  readonly requestId: string;
  /** Le gaz du keeper, en dollars. LE chiffre qui décide de GMX. */
  readonly executionFeeUsd: number;
  readonly positionFeeUsd: number;
  readonly acceptablePriceUsd: number;
  readonly sizeDeltaUsd: number;
  readonly raw: unknown;
}

export interface GmxSubmittedOrder {
  readonly requestId: string;
  readonly status: string;
  readonly txHash: string | null;
  readonly orderKeys: readonly string[];
  readonly raw: unknown;
}

export interface GmxOrderIntent {
  readonly symbol: string;
  readonly direction: "long" | "short";
  readonly sizeDeltaUsd: number;
  readonly leverage: number;
  readonly slippageBps: number;
  readonly isDecrease: boolean;
  readonly stopLossPriceUsd?: number | undefined;
  readonly takeProfitPriceUsd?: number | undefined;
}

/**
 * Ce que l'adaptateur demande à la chaîne, et rien de plus.
 *
 * `prepareOrder` ne signe rien et n'envoie rien : il calcule. C'est ce qui
 * permet de connaître le gaz AVANT de s'engager, et donc de refuser.
 */
export interface GmxChain {
  readonly walletAddress: string;
  listMarkets(): Promise<readonly GmxMarketSnapshot[]>;
  listPositions(): Promise<readonly GmxPositionSnapshot[]>;
  listOpenOrders(): Promise<readonly GmxOpenOrder[]>;
  getBalances(): Promise<GmxAccountBalances>;
  prepareOrder(intent: GmxOrderIntent): Promise<GmxPreparedOrder>;
  submitPreparedOrder(prepared: GmxPreparedOrder): Promise<GmxSubmittedOrder>;
  getOrderStatus(requestId: string): Promise<GmxSubmittedOrder>;
  cancelOrders(orderKeys: readonly string[]): Promise<void>;
}

export interface GmxVenueOptions {
  /** Injecté par les tests. En production, construit depuis le SDK. */
  readonly chain: GmxChain;
  readonly slippageBps?: number | undefined;
  readonly maxExecutionFeeFraction?: number | undefined;
}

/* ---------------------------------------------------------------- */

/**
 * Traduit le statut du relais GMX en statut d'ordre.
 *
 * Les états intermédiaires du relais (`relay_pending`, `relay_submitted`…)
 * décrivent l'acheminement, pas le sort de l'ordre. Ils deviennent tous
 * « en attente » : l'ordre existe, le keeper ne l'a pas encore exécuté.
 */
export function mapGmxStatus(status: string): PerpOrderStatus {
  switch (status) {
    case "executed":
      return "filled";
    case "cancelled":
      return "cancelled";
    case "relay_failed":
    case "relay_reverted":
      return "rejected";
    case "created":
      return "open";
    default:
      return "pending";
  }
}

/**
 * Refuse l'ordre quand le gaz dépasse une part du notionnel.
 *
 * Ce garde-fou existe parce que le coût fixe est le seul qui ne prévient
 * pas : un frais proportionnel reste proportionnel quand la position rétrécit,
 * un frais fixe devient tout le trade. Lève plutôt que de rendre un refus
 * silencieux — l'appelant doit savoir pourquoi rien n'est parti.
 */
export function assertExecutionFeeAcceptable(
  executionFeeUsd: number,
  notionalUsd: number,
  maxFraction: number,
): void {
  if (notionalUsd <= 0) {
    throw new Error("GMX : notionnel nul, ordre refusé");
  }
  const fraction = executionFeeUsd / notionalUsd;
  if (fraction > maxFraction) {
    throw new Error(
      `GMX : frais d'exécution de ${executionFeeUsd.toFixed(2)} $ sur un notionnel de ` +
        `${notionalUsd.toFixed(2)} $, soit ${(fraction * 100).toFixed(2)} % — ` +
        `au-dessus du plafond de ${(maxFraction * 100).toFixed(2)} %. Ordre non envoyé.`,
    );
  }
}

function toPosition(snapshot: GmxPositionSnapshot): PerpPosition {
  const base = {
    symbol: snapshot.symbol,
    side: snapshot.isLong ? ("long" as const) : ("short" as const),
    size: Math.abs(snapshot.sizeInTokens),
    entryPrice: snapshot.entryPriceUsd,
    markPrice: snapshot.markPriceUsd,
    notionalUsd: Math.abs(snapshot.sizeUsd),
    marginUsd: snapshot.collateralUsd,
    leverage: snapshot.leverage,
    unrealizedPnlUsd: snapshot.unrealizedPnlUsd,
  };
  // `exactOptionalPropertyTypes` interdit d'écrire la clé à `undefined` :
  // on ne l'ajoute que lorsque la plateforme l'a réellement donnée.
  return snapshot.liquidationPriceUsd === null
    ? base
    : { ...base, liquidationPrice: snapshot.liquidationPriceUsd };
}

export class GmxVenue implements PerpsVenue {
  readonly id = VENUE_ID;
  private readonly chain: GmxChain;
  private readonly slippageBps: number;
  private readonly maxExecutionFeeFraction: number;
  private markets: readonly GmxMarketSnapshot[] | null = null;
  /**
   * Le pont entre les deux identités d'un ordre GMX : l'identifiant de
   * requête du relais, et la clé on-chain. Sans lui, `getOrder` ne saurait
   * pas quoi faire d'un identifiant rendu par `placeOrder` avant que le
   * keeper n'ait créé l'ordre.
   */
  private readonly requestIdByOrderKey = new Map<string, string>();

  constructor(options: GmxVenueOptions) {
    this.chain = options.chain;
    this.slippageBps = options.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    this.maxExecutionFeeFraction =
      options.maxExecutionFeeFraction ?? DEFAULT_MAX_EXECUTION_FEE_FRACTION;
  }

  /** Les marchés, relus une seule fois. `refresh` force la relecture. */
  private async ensureMarkets(refresh = false): Promise<readonly GmxMarketSnapshot[]> {
    if (this.markets === null || refresh) {
      this.markets = await this.chain.listMarkets();
    }
    return this.markets;
  }

  private async findMarket(symbol: string): Promise<GmxMarketSnapshot> {
    const wanted = symbol.toUpperCase();
    for (const pass of [false, true]) {
      const markets = await this.ensureMarkets(pass);
      const found = markets.find(
        (m) => !m.isSpotOnly && m.symbol.toUpperCase() === wanted,
      );
      if (found) return found;
    }
    throw new Error(`Marché inconnu sur GMX : ${symbol}`);
  }

  async getAccountState(): Promise<PerpAccountState> {
    const [balances, positions] = await Promise.all([
      this.chain.getBalances(),
      this.chain.listPositions(),
    ]);
    return {
      equityUsd: balances.equityUsd,
      availableMarginUsd: balances.availableMarginUsd,
      positions: positions.filter((p) => Math.abs(p.sizeUsd) > 0).map(toPosition),
    };
  }

  async getMarketMeta(symbol: string): Promise<PerpMarketMeta> {
    const market = await this.findMarket(symbol);
    return {
      symbol: market.symbol,
      maxLeverage: Math.max(1, market.maxLeverage),
      quantityStep: QUANTITY_STEP,
      priceStep: market.priceStep > 0 ? market.priceStep : 0.01,
      // GMX documente un vrai minimum de taille, contrairement à ce qu'on
      // supposait dans le barème : on prend le sien quand il est donné.
      minOrderValueUsd:
        market.minPositionSizeUsd > 0 ? market.minPositionSizeUsd : 10,
      maintenanceMarginFraction: market.minCollateralFactor,
    };
  }

  /**
   * Prépare l'ordre, vérifie le gaz, puis seulement envoie.
   *
   * L'ordre des trois étapes est le tout : préparer ne signe rien, donc un
   * refus au motif du gaz ne laisse aucune trace on-chain et ne coûte rien.
   */
  async placeOrder(request: PerpOrderRequest): Promise<PerpOrderResult> {
    const market = await this.findMarket(request.symbol);
    const referencePrice = request.limitPrice ?? market.markPriceUsd;
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      throw new Error(`GMX : prix de référence indisponible pour ${request.symbol}`);
    }

    const sizeDeltaUsd = request.size * referencePrice;

    const intent: GmxOrderIntent = {
      symbol: market.symbol,
      direction: request.side,
      sizeDeltaUsd,
      leverage: request.leverage,
      slippageBps: this.slippageBps,
      isDecrease: request.reduceOnly === true,
      stopLossPriceUsd: request.stopLossPrice,
      takeProfitPriceUsd: request.takeProfitPrice,
    };

    const prepared = await this.chain.prepareOrder(intent);
    assertExecutionFeeAcceptable(
      prepared.executionFeeUsd,
      prepared.sizeDeltaUsd > 0 ? prepared.sizeDeltaUsd : sizeDeltaUsd,
      this.maxExecutionFeeFraction,
    );

    const submitted = await this.chain.submitPreparedOrder(prepared);
    for (const key of submitted.orderKeys) {
      this.requestIdByOrderKey.set(key, submitted.requestId);
    }

    return this.toOrderResult(submitted, request.clientOrderId, request.size);
  }

  async cancelOrder(_symbol: string, venueOrderId: string): Promise<void> {
    await this.chain.cancelOrders([venueOrderId]);
  }

  /**
   * GMX n'ayant pas d'identifiant client, `venueOrderId` est soit une clé
   * d'ordre on-chain, soit — tant que le keeper n'a rien créé — l'identifiant
   * de requête du relais. On accepte les deux plutôt que d'imposer à
   * l'appelant de savoir lequel il tient.
   */
  async getOrder(_symbol: string, venueOrderId: string): Promise<PerpOrderResult> {
    const requestId = this.requestIdByOrderKey.get(venueOrderId) ?? venueOrderId;
    const status = await this.chain.getOrderStatus(requestId);
    return this.toOrderResult(status, "", 0);
  }

  async listOpenOrders(): Promise<readonly PerpOrderResult[]> {
    const orders = await this.chain.listOpenOrders();
    return orders.map((order) => ({
      venueOrderId: order.key,
      // GMX ne transporte pas d'identifiant client : il n'y a rien à rendre.
      clientOrderId: "",
      status: "open" as const,
      filledSize: 0,
      raw: order.raw,
    }));
  }

  private toOrderResult(
    submitted: GmxSubmittedOrder,
    clientOrderId: string,
    requestedSize: number,
  ): PerpOrderResult {
    const status = mapGmxStatus(submitted.status);
    return {
      venueOrderId: submitted.orderKeys[0] ?? submitted.requestId,
      clientOrderId,
      status,
      // Un ordre GMX ne s'exécute pas partiellement : le keeper l'exécute
      // en entier ou l'annule. Tant qu'il n'est pas exécuté, rien n'est pris.
      filledSize: status === "filled" ? requestedSize : 0,
      raw: submitted.raw,
    };
  }
}

/**
 * Mesure le frais d'exécution réel, sans rien envoyer.
 *
 * C'est la fonction qui remplace la devinette de `GMX_V2_BASE`
 * (`fixedCostUsdPerSide: 0.5`) par un chiffre observé. Elle prépare un ordre
 * et le jette : préparer ne signe rien, ne coûte rien, et ne laisse aucune
 * trace on-chain.
 */
export async function measureGmxExecutionFeeUsd(
  chain: GmxChain,
  symbol: string,
  probeNotionalUsd = 100,
): Promise<number> {
  const prepared = await chain.prepareOrder({
    symbol,
    direction: "long",
    sizeDeltaUsd: probeNotionalUsd,
    leverage: 1,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
    isDecrease: false,
  });
  return prepared.executionFeeUsd;
}
