import { describe, expect, it } from "vitest";
import {
  HyperliquidVenue,
  createHyperliquidVenue,
  fromVenueSymbol,
  hyperliquidCredentialsPresent,
  mapOrderStatus,
  readHyperliquidCredentials,
  stepFromPrecision,
  toVenueSymbol,
  type HyperliquidExchange,
} from "../hyperliquidVenue";

const TICK_SIZE = 4;
const DECIMAL_PLACES = 2;

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

function fakeExchange(overrides: Partial<HyperliquidExchange> = {}): {
  exchange: HyperliquidExchange;
  calls: Call[];
} {
  const calls: Call[] = [];
  const record = (name: string, ...args: unknown[]): void => {
    calls.push({ name, args });
  };

  const exchange: HyperliquidExchange = {
    precisionMode: TICK_SIZE,
    async loadMarkets() {
      record("loadMarkets");
      return {};
    },
    market(symbol: string) {
      record("market", symbol);
      return {
        limits: { leverage: { max: 20 }, cost: { min: 10 } },
        precision: { amount: 0.001, price: 0.1 },
      };
    },
    async fetchBalance() {
      record("fetchBalance");
      return { USDC: { total: 1000, free: 800 } };
    },
    async fetchPositions() {
      record("fetchPositions");
      return [];
    },
    async createOrder(...args: unknown[]) {
      record("createOrder", ...args);
      return {
        id: "77",
        clientOrderId: "cid-1",
        status: "open",
        filled: 0,
        amount: 1.5,
      };
    },
    async cancelOrder(...args: unknown[]) {
      record("cancelOrder", ...args);
      return {};
    },
    async fetchOrder(...args: unknown[]) {
      record("fetchOrder", ...args);
      return { id: "77", clientOrderId: "cid-1", status: "closed", filled: 1.5, amount: 1.5, average: 101 };
    },
    async fetchOpenOrders() {
      record("fetchOpenOrders");
      return [];
    },
    async setLeverage(...args: unknown[]) {
      record("setLeverage", ...args);
      return {};
    },
    ...overrides,
  };

  return { exchange, calls };
}

describe("symboles", () => {
  it("cote en USDC comme Hyperliquid l'attend", () => {
    expect(toVenueSymbol("BTC")).toBe("BTC/USDC:USDC");
    expect(toVenueSymbol("eth")).toBe("ETH/USDC:USDC");
  });

  it("laisse tranquille un symbole déjà complet", () => {
    expect(toVenueSymbol("BTC/USDC:USDC")).toBe("BTC/USDC:USDC");
  });

  it("fait le chemin inverse", () => {
    expect(fromVenueSymbol("BTC/USDC:USDC")).toBe("BTC");
    expect(fromVenueSymbol("BTC")).toBe("BTC");
  });
});

describe("stepFromPrecision", () => {
  it("prend la valeur telle quelle en mode taille de pas", () => {
    expect(stepFromPrecision(0.001, TICK_SIZE, 1)).toBe(0.001);
  });

  it("convertit un nombre de décimales en pas", () => {
    expect(stepFromPrecision(3, DECIMAL_PLACES, 1)).toBe(0.001);
    expect(stepFromPrecision(0, DECIMAL_PLACES, 1)).toBe(1);
  });

  it("ne confond pas 1 décimale avec un pas de 1", () => {
    // C'est tout l'intérêt de consulter le mode : 1 vaut 0,1 ici, pas 1.
    expect(stepFromPrecision(1, DECIMAL_PLACES, 0.5)).toBe(0.1);
    expect(stepFromPrecision(1, TICK_SIZE, 0.5)).toBe(1);
  });

  it("retombe sur la valeur de repli quand la précision est absurde", () => {
    expect(stepFromPrecision("bof", TICK_SIZE, 0.25)).toBe(0.25);
    expect(stepFromPrecision(99, DECIMAL_PLACES, 0.25)).toBe(0.25);
  });
});

describe("mapOrderStatus", () => {
  it("traduit les états de ccxt", () => {
    expect(mapOrderStatus("closed", 1, 1)).toBe("filled");
    expect(mapOrderStatus("canceled", 0, 1)).toBe("cancelled");
    expect(mapOrderStatus("rejected", 0, 1)).toBe("rejected");
    expect(mapOrderStatus("open", 0, 1)).toBe("open");
    expect(mapOrderStatus(undefined, 0, 1)).toBe("pending");
  });

  it("voit un remplissage partiel avant tout le reste", () => {
    expect(mapOrderStatus("open", 0.4, 1)).toBe("partially_filled");
  });
});

describe("identifiants", () => {
  it("exige les deux secrets", () => {
    expect(readHyperliquidCredentials({})).toBeNull();
    expect(readHyperliquidCredentials({ HYPERLIQUID_WALLET_ADDRESS: "0xabc" })).toBeNull();
    expect(readHyperliquidCredentials({ HYPERLIQUID_PRIVATE_KEY: "0xdef" })).toBeNull();
  });

  it("ignore des valeurs vides ou blanches", () => {
    expect(
      readHyperliquidCredentials({
        HYPERLIQUID_WALLET_ADDRESS: "  ",
        HYPERLIQUID_PRIVATE_KEY: "0xdef",
      }),
    ).toBeNull();
  });

  it("rend les deux quand ils sont là", () => {
    const creds = readHyperliquidCredentials({
      HYPERLIQUID_WALLET_ADDRESS: "0xabc",
      HYPERLIQUID_PRIVATE_KEY: "0xdef",
    });
    expect(creds?.walletAddress).toBe("0xabc");
    expect(hyperliquidCredentialsPresent({
      HYPERLIQUID_WALLET_ADDRESS: "0xabc",
      HYPERLIQUID_PRIVATE_KEY: "0xdef",
    })).toBe(true);
  });

  it("ne construit rien sans secrets", () => {
    expect(createHyperliquidVenue({ env: {} })).toBeNull();
  });
});

describe("HyperliquidVenue", () => {
  it("lit le capital et la marge disponible", async () => {
    const { exchange } = fakeExchange();
    const venue = new HyperliquidVenue({ exchange });
    const state = await venue.getAccountState();
    expect(state.equityUsd).toBe(1000);
    expect(state.availableMarginUsd).toBe(800);
    expect(state.positions).toEqual([]);
  });

  it("ignore les positions de taille nulle", async () => {
    const { exchange } = fakeExchange({
      async fetchPositions() {
        return [
          { symbol: "BTC/USDC:USDC", contracts: 0, side: "long" },
          {
            symbol: "ETH/USDC:USDC",
            contracts: 2,
            side: "short",
            entryPrice: 3000,
            markPrice: 2900,
            notional: 5800,
            initialMargin: 1000,
            leverage: 5,
            liquidationPrice: 3400,
            unrealizedPnl: 200,
          },
        ];
      },
    });
    const state = await new HyperliquidVenue({ exchange }).getAccountState();
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0]?.symbol).toBe("ETH");
    expect(state.positions[0]?.side).toBe("short");
    expect(state.positions[0]?.liquidationPrice).toBe(3400);
  });

  it("n'invente pas un prix de liquidation absent", async () => {
    const { exchange } = fakeExchange({
      async fetchPositions() {
        return [
          {
            symbol: "BTC/USDC:USDC",
            contracts: 1,
            side: "long",
            entryPrice: 100,
            markPrice: 100,
            notional: 100,
          },
        ];
      },
    });
    const state = await new HyperliquidVenue({ exchange }).getAccountState();
    expect(state.positions[0]).not.toHaveProperty("liquidationPrice");
  });

  it("déduit la marge de maintenance du levier maximal", async () => {
    const { exchange } = fakeExchange();
    const meta = await new HyperliquidVenue({ exchange }).getMarketMeta("BTC");
    expect(meta.symbol).toBe("BTC");
    expect(meta.maxLeverage).toBe(20);
    expect(meta.quantityStep).toBe(0.001);
    expect(meta.minOrderValueUsd).toBe(10);
    expect(meta.maintenanceMarginFraction).toBeCloseTo(0.025, 10);
  });

  it("retombe sur le minimum documenté de 10 $ quand ccxt ne le donne pas", async () => {
    const { exchange } = fakeExchange({
      market() {
        return { limits: { leverage: { max: 10 } }, precision: { amount: 0.01, price: 0.1 } };
      },
    });
    const meta = await new HyperliquidVenue({ exchange }).getMarketMeta("BTC");
    expect(meta.minOrderValueUsd).toBe(10);
  });

  it("règle le levier en marge isolée AVANT d'envoyer l'ordre", async () => {
    const { exchange, calls } = fakeExchange();
    await new HyperliquidVenue({ exchange }).placeOrder({
      symbol: "BTC",
      side: "long",
      size: 1.5,
      type: "market",
      leverage: 3,
      clientOrderId: "cid-1",
      limitPrice: 100,
    });

    const names = calls.map((c) => c.name);
    expect(names.indexOf("setLeverage")).toBeLessThan(names.indexOf("createOrder"));
    const leverageCall = calls.find((c) => c.name === "setLeverage");
    expect(leverageCall?.args[0]).toBe(3);
    expect(leverageCall?.args[1]).toBe("BTC/USDC:USDC");
    expect(leverageCall?.args[2]).toEqual({ marginMode: "isolated" });
  });

  it("n'envoie rien si le réglage du levier échoue", async () => {
    const { exchange, calls } = fakeExchange({
      async setLeverage() {
        throw new Error("levier refusé");
      },
    });
    await expect(
      new HyperliquidVenue({ exchange }).placeOrder({
        symbol: "BTC",
        side: "long",
        size: 1,
        type: "market",
        leverage: 5,
        clientOrderId: "cid-2",
      }),
    ).rejects.toThrow("levier refusé");
    expect(calls.some((c) => c.name === "createOrder")).toBe(false);
  });

  it("traduit un long en achat et joint le stop à l'ordre", async () => {
    const { exchange, calls } = fakeExchange();
    await new HyperliquidVenue({ exchange }).placeOrder({
      symbol: "BTC",
      side: "short",
      size: 2,
      type: "limit",
      leverage: 2,
      clientOrderId: "cid-3",
      limitPrice: 105,
      stopLossPrice: 110,
    });
    const order = calls.find((c) => c.name === "createOrder");
    expect(order?.args[0]).toBe("BTC/USDC:USDC");
    expect(order?.args[1]).toBe("limit");
    expect(order?.args[2]).toBe("sell");
    expect(order?.args[3]).toBe(2);
    expect(order?.args[4]).toBe(105);
    expect(order?.args[5]).toMatchObject({
      clientOrderId: "cid-3",
      marginMode: "isolated",
      stopLossPrice: 110,
    });
  });

  it("ne pose pas de clé reduceOnly quand ce n'est pas demandé", async () => {
    const { exchange, calls } = fakeExchange();
    await new HyperliquidVenue({ exchange }).placeOrder({
      symbol: "BTC",
      side: "long",
      size: 1,
      type: "market",
      leverage: 1,
      clientOrderId: "cid-4",
    });
    const order = calls.find((c) => c.name === "createOrder");
    expect(order?.args[5]).not.toHaveProperty("reduceOnly");
  });

  it("rend un résultat d'ordre exploitable", async () => {
    const { exchange } = fakeExchange();
    const result = await new HyperliquidVenue({ exchange }).getOrder("BTC", "77");
    expect(result.venueOrderId).toBe("77");
    expect(result.status).toBe("filled");
    expect(result.filledSize).toBe(1.5);
    expect(result.averagePrice).toBe(101);
  });
});
