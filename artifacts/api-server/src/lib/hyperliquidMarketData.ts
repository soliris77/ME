import ccxt from "ccxt";
import { HyperliquidFeed } from "@workspace/market-data";

type HyperliquidMarkets = Awaited<ReturnType<HyperliquidFeed["listMarkets"]>>;

let feed: HyperliquidFeed | null = null;
let cachedMarkets: HyperliquidMarkets | null = null;
let cachedAt = 0;
let refresh: Promise<HyperliquidMarkets> | null = null;

/**
 * Public-only client. No wallet address or private key is passed here.
 * The private Hyperliquid venue remains isolated in hyperliquidVenue.ts.
 */
export function getHyperliquidPublicFeed(): HyperliquidFeed {
  if (!feed) {
    const ExchangeCtor = (ccxt as unknown as Record<string, unknown>)["hyperliquid"];
    if (typeof ExchangeCtor !== "function") {
      throw new Error("ccxt ne fournit pas l'adaptateur public Hyperliquid");
    }
    const Ctor = ExchangeCtor as new (config: unknown) => ConstructorParameters<typeof HyperliquidFeed>[0]["exchange"];
    const exchange = new Ctor({
      enableRateLimit: true,
      options: { defaultType: "swap" },
    });
    feed = new HyperliquidFeed({ exchange });
  }
  return feed;
}

export async function listHyperliquidMarkets() {
  const now = Date.now();
  if (cachedMarkets && now - cachedAt < 60_000) return cachedMarkets;
  if (!refresh) {
    refresh = getHyperliquidPublicFeed().listMarkets()
      .then((markets) => {
        cachedMarkets = markets;
        cachedAt = Date.now();
        return markets;
      })
      .finally(() => {
        refresh = null;
      });
  }
  return refresh;
}