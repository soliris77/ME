import ccxt from "ccxt";
import {
  maintenanceMarginFromMaxLeverage,
  type PerpAccountState,
  type PerpMarketMeta,
  type PerpOrderRequest,
  type PerpOrderResult,
  type PerpOrderStatus,
  type PerpPosition,
  type PerpsVenue,
} from "@workspace/perps";

/**
 * L'adaptateur Hyperliquid.
 *
 * Toute la logique de décision vit dans `@workspace/perps`, qui ne connaît
 * ni le réseau ni les clés. Ce fichier est la seule chose qui parle à la
 * plateforme, et il ne décide rien : il traduit.
 *
 * SECRETS — la clé privée ne vient que de l'environnement, jamais d'un
 * argument de ligne de commande, jamais d'une requête HTTP, jamais d'un
 * champ en base. Elle n'est ni journalisée, ni renvoyée, ni incluse dans un
 * message d'erreur. Les fonctions ci-dessous ne rendent au reste de
 * l'application qu'un booléen de présence et une adresse publique.
 */

const VENUE_ID = "hyperliquid";

/** Le minimum documenté par Hyperliquid, quand ccxt ne le donne pas. */
const FALLBACK_MIN_ORDER_VALUE_USD = 10;

/** Modes de précision de ccxt. */
const DECIMAL_PLACES = 2;
const TICK_SIZE = 4;

export interface HyperliquidCredentials {
  /** Adresse publique du compte. Publique : elle peut être affichée. */
  readonly walletAddress: string;
  /** Clé privée du portefeuille d'API. Ne sort jamais de ce module. */
  readonly privateKey: string;
}

type EnvLike = Record<string, string | undefined>;

/**
 * Lit les identifiants dans l'environnement. Rend `null` dès qu'il en
 * manque un — un compte à moitié configuré ne doit jamais tenter un ordre.
 */
export function readHyperliquidCredentials(
  env: EnvLike = process.env,
): HyperliquidCredentials | null {
  const walletAddress = (env.HYPERLIQUID_WALLET_ADDRESS ?? "").trim();
  const privateKey = (env.HYPERLIQUID_PRIVATE_KEY ?? "").trim();
  if (walletAddress === "" || privateKey === "") return null;
  return { walletAddress, privateKey };
}

/** Vrai si les deux secrets sont présents. Ne révèle rien d'autre. */
export function hyperliquidCredentialsPresent(env: EnvLike = process.env): boolean {
  return readHyperliquidCredentials(env) !== null;
}

/** L'adresse publique, pour l'affichage. Jamais la clé. */
export function hyperliquidPublicAddress(env: EnvLike = process.env): string | null {
  return readHyperliquidCredentials(env)?.walletAddress ?? null;
}

/**
 * La surface de ccxt réellement utilisée. La déclarer permet aux tests
 * d'injecter un faux et de vérifier ce qui part, sans réseau ni clé.
 */
export interface HyperliquidExchange {
  precisionMode?: number;
  loadMarkets(reload?: boolean): Promise<unknown>;
  market(symbol: string): unknown;
  fetchBalance(params?: unknown): Promise<unknown>;
  fetchPositions(symbols?: string[], params?: unknown): Promise<unknown[]>;
  createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number,
    params?: unknown,
  ): Promise<unknown>;
  cancelOrder(id: string, symbol?: string, params?: unknown): Promise<unknown>;
  fetchOrder(id: string, symbol?: string, params?: unknown): Promise<unknown>;
  fetchOpenOrders(symbol?: string, since?: number, limit?: number): Promise<unknown[]>;
  setLeverage(leverage: number, symbol?: string, params?: unknown): Promise<unknown>;
}

export interface HyperliquidVenueOptions {
  /** Injecté par les tests. En production, on le construit depuis ccxt. */
  readonly exchange?: HyperliquidExchange;
  readonly env?: EnvLike;
}

/** Hyperliquid cote en USDC : « BTC » devient « BTC/USDC:USDC ». */
export function toVenueSymbol(symbol: string): string {
  if (symbol.includes("/")) return symbol;
  return `${symbol.toUpperCase()}/USDC:USDC`;
}

/** Le chemin inverse : « BTC/USDC:USDC » redevient « BTC ». */
export function fromVenueSymbol(symbol: string): string {
  const slash = symbol.indexOf("/");
  return slash === -1 ? symbol : symbol.slice(0, slash);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNum(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function pick(source: unknown, key: string): unknown {
  if (source === null || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

function path(source: unknown, ...keys: readonly string[]): unknown {
  let current: unknown = source;
  for (const key of keys) {
    current = pick(current, key);
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * Traduit la précision de ccxt en pas réel.
 *
 * ccxt exprime la précision de deux façons selon la plateforme : un nombre
 * de décimales, ou directement la taille du pas. Le mode est porté par
 * l'objet exchange ; s'en remettre à une devinette sur la valeur donnerait
 * un pas de 1 pour une précision de 1 décimale, soit des ordres refusés.
 */
export function stepFromPrecision(
  value: unknown,
  precisionMode: number | undefined,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (precisionMode === TICK_SIZE) return n > 0 ? n : fallback;
  if (precisionMode === DECIMAL_PLACES) {
    if (n < 0 || n > 18) return fallback;
    return Number(Math.pow(10, -n).toFixed(18));
  }
  // Mode inconnu : une valeur non entière ne peut être qu'une taille de pas.
  if (n > 0 && !Number.isInteger(n)) return n;
  if (Number.isInteger(n) && n >= 0 && n <= 18) {
    return Number(Math.pow(10, -n).toFixed(18));
  }
  return fallback;
}

export function mapOrderStatus(
  status: unknown,
  filled: number,
  amount: number,
): PerpOrderStatus {
  if (status === "closed") return "filled";
  if (status === "canceled" || status === "cancelled") return "cancelled";
  if (status === "rejected") return "rejected";
  if (filled > 0 && filled < amount) return "partially_filled";
  if (status === "open") return "open";
  return "pending";
}

function toPosition(raw: unknown): PerpPosition | null {
  const size = Math.abs(num(pick(raw, "contracts")));
  if (size <= 0) return null;

  const symbol = fromVenueSymbol(String(pick(raw, "symbol") ?? ""));
  if (symbol === "") return null;

  const entryPrice = num(pick(raw, "entryPrice"));
  const markPrice = num(pick(raw, "markPrice"), entryPrice);
  const notionalUsd = num(pick(raw, "notional"), size * markPrice);
  const liquidationPrice = optionalNum(pick(raw, "liquidationPrice"));

  const base = {
    symbol,
    side: pick(raw, "side") === "short" ? ("short" as const) : ("long" as const),
    size,
    entryPrice,
    markPrice,
    notionalUsd,
    marginUsd: num(pick(raw, "initialMargin"), num(pick(raw, "collateral"))),
    leverage: num(pick(raw, "leverage"), 1),
    unrealizedPnlUsd: num(pick(raw, "unrealizedPnl")),
  };

  // `exactOptionalPropertyTypes` interdit d'écrire la clé à `undefined` :
  // on ne l'ajoute que lorsque la plateforme l'a réellement donnée.
  return liquidationPrice === undefined ? base : { ...base, liquidationPrice };
}

export class HyperliquidVenue implements PerpsVenue {
  readonly id = VENUE_ID;
  private readonly exchange: HyperliquidExchange;
  private marketsLoaded = false;

  constructor(options: HyperliquidVenueOptions = {}) {
    if (options.exchange) {
      this.exchange = options.exchange;
      return;
    }

    const credentials = readHyperliquidCredentials(options.env);
    if (!credentials) {
      throw new Error(
        "Identifiants Hyperliquid absents : renseigne HYPERLIQUID_WALLET_ADDRESS et HYPERLIQUID_PRIVATE_KEY dans les secrets.",
      );
    }

    const ExchangeCtor = (ccxt as unknown as Record<string, unknown>)["hyperliquid"];
    if (typeof ExchangeCtor !== "function") {
      throw new Error("ccxt ne fournit pas d'adaptateur hyperliquid dans cette version");
    }
    const Ctor = ExchangeCtor as new (config: unknown) => HyperliquidExchange;
    this.exchange = new Ctor({
      walletAddress: credentials.walletAddress,
      privateKey: credentials.privateKey,
      enableRateLimit: true,
      options: { defaultType: "swap" },
    });
  }

  private async ensureMarkets(): Promise<void> {
    if (this.marketsLoaded) return;
    await this.exchange.loadMarkets();
    this.marketsLoaded = true;
  }

  async getAccountState(): Promise<PerpAccountState> {
    const [balance, rawPositions] = await Promise.all([
      this.exchange.fetchBalance(),
      this.exchange.fetchPositions(),
    ]);

    const equityUsd = num(
      path(balance, "USDC", "total") ?? path(balance, "total", "USDC"),
    );
    const availableMarginUsd = num(
      path(balance, "USDC", "free") ?? path(balance, "free", "USDC"),
    );

    const positions: PerpPosition[] = [];
    for (const raw of rawPositions) {
      const position = toPosition(raw);
      if (position) positions.push(position);
    }

    return { equityUsd, availableMarginUsd, positions };
  }

  async getMarketMeta(symbol: string): Promise<PerpMarketMeta> {
    await this.ensureMarkets();
    const venueSymbol = toVenueSymbol(symbol);
    const market = this.exchange.market(venueSymbol);
    if (!market) {
      throw new Error(`Marché inconnu sur Hyperliquid : ${symbol}`);
    }

    const mode = this.exchange.precisionMode;
    const maxLeverage = Math.max(1, num(path(market, "limits", "leverage", "max"), 1));
    const minCost = optionalNum(path(market, "limits", "cost", "min"));

    return {
      symbol: fromVenueSymbol(venueSymbol),
      maxLeverage,
      quantityStep: stepFromPrecision(path(market, "precision", "amount"), mode, 0.0001),
      priceStep: stepFromPrecision(path(market, "precision", "price"), mode, 0.01),
      minOrderValueUsd:
        minCost !== undefined && minCost > 0 ? minCost : FALLBACK_MIN_ORDER_VALUE_USD,
      maintenanceMarginFraction: maintenanceMarginFromMaxLeverage(maxLeverage),
    };
  }

  async placeOrder(request: PerpOrderRequest): Promise<PerpOrderResult> {
    await this.ensureMarkets();
    const venueSymbol = toVenueSymbol(request.symbol);

    // Le levier se règle AVANT l'ordre. Si ce réglage échoue, on n'envoie
    // rien : une position ouverte au levier de la dernière fois n'est pas
    // la position qui a été calculée.
    await this.exchange.setLeverage(request.leverage, venueSymbol, {
      marginMode: "isolated",
    });

    const params: Record<string, unknown> = {
      clientOrderId: request.clientOrderId,
      marginMode: "isolated",
    };
    if (request.reduceOnly === true) params.reduceOnly = true;
    if (request.stopLossPrice !== undefined) params.stopLossPrice = request.stopLossPrice;
    if (request.takeProfitPrice !== undefined) {
      params.takeProfitPrice = request.takeProfitPrice;
    }

    const raw = await this.exchange.createOrder(
      venueSymbol,
      request.type,
      request.side === "long" ? "buy" : "sell",
      request.size,
      request.limitPrice,
      params,
    );

    return this.toOrderResult(raw, request.clientOrderId, request.size);
  }

  async cancelOrder(symbol: string, venueOrderId: string): Promise<void> {
    await this.exchange.cancelOrder(venueOrderId, toVenueSymbol(symbol));
  }

  async getOrder(symbol: string, venueOrderId: string): Promise<PerpOrderResult> {
    const raw = await this.exchange.fetchOrder(venueOrderId, toVenueSymbol(symbol));
    return this.toOrderResult(raw, String(pick(raw, "clientOrderId") ?? ""), 0);
  }

  async listOpenOrders(): Promise<readonly PerpOrderResult[]> {
    const raws = await this.exchange.fetchOpenOrders();
    return raws.map((raw) =>
      this.toOrderResult(raw, String(pick(raw, "clientOrderId") ?? ""), 0),
    );
  }

  private toOrderResult(
    raw: unknown,
    clientOrderId: string,
    requestedSize: number,
  ): PerpOrderResult {
    const filledSize = num(pick(raw, "filled"));
    const amount = num(pick(raw, "amount"), requestedSize);
    const averagePrice = optionalNum(pick(raw, "average"));

    const base = {
      venueOrderId: String(pick(raw, "id") ?? ""),
      clientOrderId: String(pick(raw, "clientOrderId") ?? clientOrderId),
      status: mapOrderStatus(pick(raw, "status"), filledSize, amount),
      filledSize,
      raw,
    };
    return averagePrice === undefined ? base : { ...base, averagePrice };
  }
}

/**
 * Construit la plateforme, ou rend `null` quand les secrets manquent.
 *
 * Rendre `null` plutôt que lever : l'absence de secrets est l'état normal
 * tant que le système est en mode fantôme, et le worker doit pouvoir
 * continuer à calculer et à journaliser sans compte configuré.
 */
export function createHyperliquidVenue(
  options: HyperliquidVenueOptions = {},
): HyperliquidVenue | null {
  if (!options.exchange && !hyperliquidCredentialsPresent(options.env)) return null;
  return new HyperliquidVenue(options);
}
