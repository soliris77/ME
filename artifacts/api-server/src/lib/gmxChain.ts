import { GmxApiSdk, PrivateKeySigner } from "@gmx-io/sdk/v2";
import {
  readGmxCredentials,
  type GmxAccountBalances,
  type GmxChain,
  type GmxMarketSnapshot,
  type GmxOpenOrder,
  type GmxOrderIntent,
  type GmxPositionSnapshot,
  type GmxPreparedOrder,
  type GmxSubmittedOrder,
} from "./gmxVenue";

/**
 * L'implémentation du port `GmxChain`, par-dessus le SDK officiel de GMX.
 *
 * C'est le SEUL fichier du projet qui connaisse les entrailles de GMX.
 * `gmxVenue.ts` ne voit que le port, et les tests n'ont besoin ni de réseau
 * ni de clé.
 *
 * Pourquoi le SDK plutôt que des appels de contrats à la main : parce que
 * tout ce qui coûte de l'argent quand on se trompe est là-dedans. Le prix
 * acceptable, l'estimation du gaz du keeper, l'encodage de l'ordre en
 * multicall, l'adresse du routeur qui change à chaque redéploiement. Réécrire
 * ça, c'est réécrire les endroits exacts où l'on perd de l'argent.
 *
 * TROIS CONVENTIONS DE GMX, qu'il faut avoir en tête pour lire ce fichier :
 *
 *   - les montants en dollars ont 30 décimales ;
 *   - un prix a (30 - décimales du jeton) décimales, donc un prix et un
 *     montant ne se comparent jamais sans conversion ;
 *   - le levier est en points de base : 10 000 = 1×.
 *
 * SECRETS — la clé privée n'est lue qu'ici, depuis l'environnement, pour
 * construire le signataire. Elle n'est ni journalisée, ni stockée, ni rendue.
 */

const ARBITRUM_CHAIN_ID = 42161;

/** Les dollars de GMX ont 30 décimales. */
const USD_DECIMALS = 30;

/** Le levier de GMX est en points de base : 10 000 = 1×. */
const LEVERAGE_BASIS_POINTS = 10_000n;

type EnvLike = Record<string, string | undefined>;

/** Convertit un entier à `decimals` décimales en nombre flottant. */
export function fromScaled(value: bigint, decimals: number): number {
  if (decimals <= 0) return Number(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const rest = value % divisor;
  return Number(whole) + Number(rest) / Number(divisor);
}

/** Convertit un nombre flottant en entier à `decimals` décimales. */
export function toScaled(value: number, decimals: number): bigint {
  if (!Number.isFinite(value)) return 0n;
  // `toFixed` plutôt que la multiplication : au-delà de 2^53 la
  // multiplication flottante perd les unités, et une taille d'ordre fausse
  // ne se rattrape pas.
  const text = value.toFixed(decimals);
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const magnitude = BigInt(whole + padded);
  return negative ? -magnitude : magnitude;
}

const usd = (value: bigint): number => fromScaled(value, USD_DECIMALS);
const toUsd = (value: number): bigint => toScaled(value, USD_DECIMALS);

/**
 * Le prix d'un jeton a (30 - ses décimales) décimales chez GMX. La formule
 * est bizarre mais elle a une raison : prix × quantité donne alors
 * directement un montant à 30 décimales, sans conversion intermédiaire.
 */
export function priceDecimalsFor(tokenDecimals: number): number {
  return USD_DECIMALS - tokenDecimals;
}

/**
 * Un pas de prix raisonnable pour l'affichage et l'alignement.
 *
 * GMX n'impose aucun pas : les prix sont continus. On en fabrique un qui ait
 * du sens à l'échelle du prix, pour que le reste du système manipule des
 * nombres lisibles.
 */
export function priceStepFor(priceUsd: number): number {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return 0.01;
  if (priceUsd >= 1000) return 0.1;
  if (priceUsd >= 1) return 0.01;
  if (priceUsd >= 0.01) return 0.0001;
  return 0.00000001;
}

export interface GmxSdkChainOptions {
  readonly env?: EnvLike;
  /** Injecté par les tests. En production, construit depuis les secrets. */
  readonly sdk?: GmxApiSdk;
  readonly walletAddress?: string;
  readonly signer?: PrivateKeySigner;
  readonly chainId?: number;
}

interface PreparedRaw {
  readonly requestId: string;
  readonly prepared: unknown;
  readonly signature: string | null;
}

export class GmxSdkChain implements GmxChain {
  readonly walletAddress: string;
  private readonly sdk: GmxApiSdk;
  private readonly signer: PrivateKeySigner | null;
  /**
   * Ce que `prepareOrder` a produit, gardé le temps de l'envoi. Le port ne
   * transporte que des nombres ; l'objet du SDK, lui, doit survivre entre la
   * préparation et la signature.
   */
  private readonly pending = new Map<string, PreparedRaw>();

  constructor(options: GmxSdkChainOptions = {}) {
    const chainId = options.chainId ?? ARBITRUM_CHAIN_ID;

    if (options.sdk) {
      this.sdk = options.sdk;
      this.walletAddress = options.walletAddress ?? "";
      this.signer = options.signer ?? null;
      return;
    }

    const credentials = readGmxCredentials(options.env);
    if (!credentials) {
      throw new Error(
        "Identifiants GMX absents : renseigne GMX_WALLET_ADDRESS et GMX_PRIVATE_KEY dans les secrets.",
      );
    }

    this.sdk = new GmxApiSdk({ chainId: chainId as never });
    this.walletAddress = credentials.walletAddress;
    this.signer = new PrivateKeySigner(credentials.privateKey as never);
  }

  async listMarkets(): Promise<readonly GmxMarketSnapshot[]> {
    const [markets, tickers] = await Promise.all([
      this.sdk.fetchMarkets(),
      this.sdk.fetchMarketsTickers(),
    ]);

    const priceByMarket = new Map<string, bigint>();
    for (const ticker of tickers) {
      priceByMarket.set(ticker.marketTokenAddress, ticker.markPrice);
    }

    const out: GmxMarketSnapshot[] = [];
    for (const market of markets) {
      if (!market.isListed) continue;

      // Les paliers de levier sont ordonnés du plus permissif au plus
      // restrictif selon la taille. On retient le plus permissif : c'est le
      // plafond de la plateforme, et notre propre plafond est plus bas de
      // toute façon.
      let maxLeverage = 1;
      let minCollateralFactor = 0.01;
      for (const tier of market.leverageTiers) {
        const levier = fromScaled(tier.maxLeverage, 4);
        if (levier > maxLeverage) maxLeverage = levier;
        const facteur = usd(tier.minCollateralFactor);
        if (facteur > 0) minCollateralFactor = facteur;
      }

      const markPrice = priceByMarket.get(market.marketTokenAddress);
      // Un marché sans prix est un marché sur lequel on ne peut rien
      // dimensionner : on l'écarte plutôt que de lui prêter un prix nul.
      if (markPrice === undefined || markPrice === 0n) continue;
      const markPriceUsd = usd(markPrice);

      out.push({
        symbol: market.symbol,
        marketTokenAddress: market.marketTokenAddress,
        isSpotOnly: market.isSpotOnly,
        maxLeverage,
        minCollateralFactor,
        minPositionSizeUsd: usd(market.minPositionSizeUsd),
        minCollateralUsd: usd(market.minCollateralUsd),
        markPriceUsd,
        priceStep: priceStepFor(markPriceUsd),
      });
    }
    return out;
  }

  async listPositions(): Promise<readonly GmxPositionSnapshot[]> {
    const positions = await this.sdk.fetchPositionsInfo({
      address: this.walletAddress,
    });
    const symbolByMarket = await this.symbolByMarket();

    return positions.map((p) => {
      const sizeUsd = usd(p.sizeInUsd);
      const collateralUsd = usd(p.collateralUsd);
      return {
        key: p.key,
        symbol: symbolByMarket.get(p.marketAddress) ?? p.marketAddress,
        isLong: p.isLong,
        sizeUsd,
        // `sizeInTokens` porte les décimales du jeton d'index ; faute de les
        // connaître ici, on repasse par le prix, qui est la même quantité vue
        // autrement.
        sizeInTokens: p.markPrice > 0n ? sizeUsd / usd(p.markPrice) : 0,
        collateralUsd,
        entryPriceUsd: p.entryPrice === undefined ? 0 : usd(p.entryPrice),
        markPriceUsd: usd(p.markPrice),
        liquidationPriceUsd:
          p.liquidationPrice === undefined ? null : usd(p.liquidationPrice),
        leverage:
          p.leverage === undefined
            ? collateralUsd > 0
              ? sizeUsd / collateralUsd
              : 0
            : fromScaled(p.leverage, 4),
        unrealizedPnlUsd: usd(p.pnl),
      };
    });
  }

  async listOpenOrders(): Promise<readonly GmxOpenOrder[]> {
    const orders = await this.sdk.fetchOrders({ address: this.walletAddress });
    const symbolByMarket = await this.symbolByMarket();

    return orders.map((o) => ({
      key: o.key,
      symbol: symbolByMarket.get(o.marketAddress) ?? o.marketAddress,
      isLong: o.isLong,
      sizeDeltaUsd: usd(o.sizeDeltaUsd),
      // Les types d'ordre de GMX : 0-1 swap, 2-3 augmentation, 4-6 diminution.
      isDecrease: o.orderType >= 4,
      raw: o,
    }));
  }

  /**
   * Le capital et la marge libre.
   *
   * Le capital est le solde du portefeuille PLUS ce qui est immobilisé en
   * collatéral, sinon ouvrir une position ferait « baisser le capital » et la
   * politique réduirait la taille de la suivante pour rien. La marge libre,
   * elle, est bien le seul solde du portefeuille.
   */
  async getBalances(): Promise<GmxAccountBalances> {
    const [balances, positions] = await Promise.all([
      this.sdk.fetchWalletBalances({ address: this.walletAddress }),
      this.listPositions(),
    ]);

    const tokens = await this.sdk.fetchTokensData();
    const priceBySymbol = new Map<string, { price: bigint; decimals: number }>();
    for (const token of tokens) {
      const prices = (token as { prices?: { minPrice?: bigint } }).prices;
      if (prices?.minPrice === undefined) continue;
      priceBySymbol.set(token.symbol, {
        price: prices.minPrice,
        decimals: token.decimals,
      });
    }

    let walletUsd = 0;
    for (const balance of balances) {
      const quote = priceBySymbol.get(balance.symbol);
      if (quote === undefined) continue;
      // quantité (décimales du jeton) × prix (30 - décimales) = dollars (30).
      walletUsd += usd(balance.balance * quote.price);
    }

    let collateralUsd = 0;
    for (const position of positions) collateralUsd += position.collateralUsd;

    return {
      equityUsd: walletUsd + collateralUsd,
      availableMarginUsd: walletUsd,
    };
  }

  /**
   * Prépare l'ordre : calcule, ne signe rien, n'envoie rien.
   *
   * C'est le seul moment où l'on peut connaître le gaz réel avant de
   * s'engager. `gmxVenue` s'en sert pour refuser les ordres que le gaz rend
   * absurdes — un refus à cette étape ne laisse aucune trace on-chain.
   */
  async prepareOrder(intent: GmxOrderIntent): Promise<GmxPreparedOrder> {
    const tpsl: { type: "take-profit" | "stop-loss"; triggerPrice: bigint }[] = [];
    if (intent.stopLossPriceUsd !== undefined && intent.stopLossPriceUsd > 0) {
      tpsl.push({
        type: "stop-loss",
        triggerPrice: toUsd(intent.stopLossPriceUsd),
      });
    }
    if (intent.takeProfitPriceUsd !== undefined && intent.takeProfitPriceUsd > 0) {
      tpsl.push({
        type: "take-profit",
        triggerPrice: toUsd(intent.takeProfitPriceUsd),
      });
    }

    const request = {
      kind: intent.isDecrease ? ("decrease" as const) : ("increase" as const),
      symbol: intent.symbol,
      direction: intent.direction,
      orderType: "market" as const,
      size: toUsd(intent.sizeDeltaUsd),
      slippage: intent.slippageBps,
      leverage: (BigInt(Math.round(intent.leverage)) * LEVERAGE_BASIS_POINTS) / 1n,
      mode: "classic" as const,
      from: this.walletAddress,
      ...(tpsl.length > 0 ? { tpsl } : {}),
    };

    const prepared = await this.sdk.prepareOrder(request as never);
    const estimates = prepared.estimates;

    // Le gaz est en jeton natif chez GMX ; le SDK le rend déjà converti en
    // montant à 30 décimales dans les estimations.
    const executionFeeUsd =
      estimates === undefined ? 0 : usd(estimates.executionFeeAmount);

    this.pending.set(prepared.requestId, {
      requestId: prepared.requestId,
      prepared,
      signature: null,
    });

    return {
      requestId: prepared.requestId,
      executionFeeUsd,
      positionFeeUsd: estimates === undefined ? 0 : usd(estimates.positionFeeUsd),
      acceptablePriceUsd:
        estimates === undefined ? 0 : usd(estimates.acceptablePrice),
      sizeDeltaUsd:
        estimates === undefined ? intent.sizeDeltaUsd : usd(estimates.sizeDeltaUsd),
      raw: prepared,
    };
  }

  /** Signe puis envoie. C'est ici, et seulement ici, qu'on s'engage. */
  async submitPreparedOrder(prepared: GmxPreparedOrder): Promise<GmxSubmittedOrder> {
    const held = this.pending.get(prepared.requestId);
    if (!held) {
      throw new Error(
        `GMX : ordre ${prepared.requestId} inconnu — il faut le préparer avant de l'envoyer`,
      );
    }
    if (!this.signer) {
      throw new Error("GMX : aucun signataire — la clé privée n'est pas configurée");
    }

    const signature = await this.sdk.signOrder(held.prepared as never, this.signer);
    const submitted = await this.sdk.submitOrder({
      mode: "classic",
      requestId: prepared.requestId,
      signature,
      from: this.walletAddress,
    });
    this.pending.delete(prepared.requestId);

    return this.toSubmitted(prepared.requestId, submitted);
  }

  async getOrderStatus(requestId: string): Promise<GmxSubmittedOrder> {
    const status = await this.sdk.fetchOrderStatus({ requestId });
    return this.toSubmitted(requestId, status);
  }

  async cancelOrders(orderKeys: readonly string[]): Promise<void> {
    if (orderKeys.length === 0) return;
    if (!this.signer) {
      throw new Error("GMX : aucun signataire — la clé privée n'est pas configurée");
    }

    const prepared = await this.sdk.prepareCancelOrder({
      orderIds: [...orderKeys],
      mode: "classic",
      from: this.walletAddress,
    });
    const signature = await this.sdk.signOrder(prepared, this.signer);
    await this.sdk.submitOrder({
      mode: "classic",
      requestId: prepared.requestId,
      signature,
      from: this.walletAddress,
    });
  }

  private toSubmitted(
    requestId: string,
    response: {
      status: string;
      txHash?: string | undefined;
      orderKeys?: string[] | undefined;
    },
  ): GmxSubmittedOrder {
    return {
      requestId,
      status: response.status,
      txHash: response.txHash ?? null,
      orderKeys: response.orderKeys ?? [],
      raw: response,
    };
  }

  private marketSymbols: Map<string, string> | null = null;

  private async symbolByMarket(): Promise<Map<string, string>> {
    if (this.marketSymbols) return this.marketSymbols;
    const markets = await this.sdk.fetchMarkets();
    const map = new Map<string, string>();
    for (const market of markets) map.set(market.marketTokenAddress, market.symbol);
    this.marketSymbols = map;
    return map;
  }
}

/**
 * Construit la chaîne, ou rend `null` quand les secrets manquent.
 *
 * Rendre `null` plutôt que lever : l'absence de secrets est l'état normal
 * tant que le système est en mode fantôme, et le worker doit pouvoir
 * continuer à calculer et à journaliser sans compte configuré.
 */
export function createGmxChain(options: GmxSdkChainOptions = {}): GmxSdkChain | null {
  if (!options.sdk && readGmxCredentials(options.env) === null) return null;
  return new GmxSdkChain(options);
}
