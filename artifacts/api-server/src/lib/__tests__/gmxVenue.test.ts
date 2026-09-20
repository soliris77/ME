import { describe, expect, it } from "vitest";
import {
  assertExecutionFeeAcceptable,
  GmxVenue,
  gmxCredentialsPresent,
  gmxPublicAddress,
  mapGmxStatus,
  measureGmxExecutionFeeUsd,
  readGmxCredentials,
  type GmxChain,
  type GmxMarketSnapshot,
  type GmxOpenOrder,
  type GmxOrderIntent,
  type GmxPositionSnapshot,
  type GmxPreparedOrder,
  type GmxSubmittedOrder,
} from "../gmxVenue";

/**
 * Une fausse chaîne. Elle enregistre ce qu'on lui demande et rend ce qu'on
 * lui a dit de rendre — c'est tout ce qu'il faut pour vérifier que
 * l'adaptateur traduit juste, et qu'il refuse quand il doit refuser.
 */
class FakeChain implements GmxChain {
  readonly walletAddress = "0xabc";
  readonly prepared: GmxOrderIntent[] = [];
  readonly submitted: GmxPreparedOrder[] = [];
  readonly cancelled: string[][] = [];

  executionFeeUsd = 0.5;
  submitStatus = "created";
  orderKeys: string[] = ["0xORDER"];
  markets: GmxMarketSnapshot[] = [
    {
      symbol: "BTC",
      marketTokenAddress: "0xmarket",
      isSpotOnly: false,
      maxLeverage: 50,
      minCollateralFactor: 0.005,
      minPositionSizeUsd: 2,
      minCollateralUsd: 1,
      markPriceUsd: 100,
      priceStep: 0.01,
    },
    {
      symbol: "BTC",
      marketTokenAddress: "0xspot",
      isSpotOnly: true,
      maxLeverage: 1,
      minCollateralFactor: 1,
      minPositionSizeUsd: 0,
      minCollateralUsd: 0,
      markPriceUsd: 100,
      priceStep: 0.01,
    },
  ];
  positions: GmxPositionSnapshot[] = [];
  openOrders: GmxOpenOrder[] = [];
  balances = { equityUsd: 1000, availableMarginUsd: 900 };

  async listMarkets(): Promise<readonly GmxMarketSnapshot[]> {
    return this.markets;
  }
  async listPositions(): Promise<readonly GmxPositionSnapshot[]> {
    return this.positions;
  }
  async listOpenOrders(): Promise<readonly GmxOpenOrder[]> {
    return this.openOrders;
  }
  async getBalances() {
    return this.balances;
  }
  async prepareOrder(intent: GmxOrderIntent): Promise<GmxPreparedOrder> {
    this.prepared.push(intent);
    return {
      requestId: "req-1",
      executionFeeUsd: this.executionFeeUsd,
      positionFeeUsd: intent.sizeDeltaUsd * 0.0006,
      acceptablePriceUsd: 100,
      sizeDeltaUsd: intent.sizeDeltaUsd,
      raw: { intent },
    };
  }
  async submitPreparedOrder(prepared: GmxPreparedOrder): Promise<GmxSubmittedOrder> {
    this.submitted.push(prepared);
    return {
      requestId: prepared.requestId,
      status: this.submitStatus,
      txHash: "0xtx",
      orderKeys: this.orderKeys,
      raw: { submitted: true },
    };
  }
  async getOrderStatus(requestId: string): Promise<GmxSubmittedOrder> {
    return {
      requestId,
      status: this.submitStatus,
      txHash: "0xtx",
      orderKeys: this.orderKeys,
      raw: { status: true },
    };
  }
  async cancelOrders(orderKeys: readonly string[]): Promise<void> {
    this.cancelled.push([...orderKeys]);
  }
}

const order = {
  symbol: "BTC",
  side: "long" as const,
  size: 2,
  type: "market" as const,
  leverage: 3,
  clientOrderId: "cid-1",
};

describe("identifiants", () => {
  it("exige les deux secrets", () => {
    expect(readGmxCredentials({})).toBeNull();
    expect(readGmxCredentials({ GMX_WALLET_ADDRESS: "0xabc" })).toBeNull();
    expect(readGmxCredentials({ GMX_PRIVATE_KEY: "0xdef" })).toBeNull();
    expect(
      readGmxCredentials({ GMX_WALLET_ADDRESS: "0xabc", GMX_PRIVATE_KEY: "0xdef" }),
    ).toEqual({ walletAddress: "0xabc", privateKey: "0xdef" });
  });

  it("ignore les valeurs qui ne sont que des espaces", () => {
    expect(
      gmxCredentialsPresent({ GMX_WALLET_ADDRESS: "  ", GMX_PRIVATE_KEY: "0xdef" }),
    ).toBe(false);
  });

  it("ne rend jamais que l'adresse publique", () => {
    const env = { GMX_WALLET_ADDRESS: "0xabc", GMX_PRIVATE_KEY: "SECRET" };
    expect(gmxPublicAddress(env)).toBe("0xabc");
    expect(JSON.stringify(gmxPublicAddress(env))).not.toContain("SECRET");
  });
});

describe("mapGmxStatus", () => {
  it("traduit les états terminaux", () => {
    expect(mapGmxStatus("executed")).toBe("filled");
    expect(mapGmxStatus("cancelled")).toBe("cancelled");
    expect(mapGmxStatus("relay_failed")).toBe("rejected");
    expect(mapGmxStatus("relay_reverted")).toBe("rejected");
  });

  it("range tous les états de transport en attente", () => {
    for (const état of ["prepared", "relay_accepted", "relay_pending", "relay_submitted"]) {
      expect(mapGmxStatus(état)).toBe("pending");
    }
    expect(mapGmxStatus("created")).toBe("open");
  });
});

describe("assertExecutionFeeAcceptable", () => {
  it("laisse passer un gaz négligeable", () => {
    expect(() => assertExecutionFeeAcceptable(0.5, 1000, 0.005)).not.toThrow();
  });

  it("refuse quand le gaz dépasse la part permise", () => {
    expect(() => assertExecutionFeeAcceptable(0.5, 40, 0.005)).toThrow(/1\.25 %/);
  });

  it("refuse un notionnel nul plutôt que de diviser par zéro", () => {
    expect(() => assertExecutionFeeAcceptable(0.5, 0, 0.005)).toThrow(/notionnel nul/);
  });
});

describe("GmxVenue — lecture", () => {
  it("ignore le marché au comptant et garde celui à levier", async () => {
    const venue = new GmxVenue({ chain: new FakeChain() });
    const meta = await venue.getMarketMeta("BTC");
    expect(meta.maxLeverage).toBe(50);
    expect(meta.minOrderValueUsd).toBe(2);
  });

  it("prend le seuil de liquidation de GMX comme marge de maintenance", async () => {
    const venue = new GmxVenue({ chain: new FakeChain() });
    const meta = await venue.getMarketMeta("BTC");
    // 0,5 % : le minCollateralFactor du marché, pas la règle 1/(2×levier).
    expect(meta.maintenanceMarginFraction).toBe(0.005);
  });

  it("refuse un symbole inconnu plutôt que d'en inventer un", async () => {
    const venue = new GmxVenue({ chain: new FakeChain() });
    await expect(venue.getMarketMeta("DOGE")).rejects.toThrow(/Marché inconnu/);
  });

  it("traduit les positions, sans prix de liquidation quand il manque", async () => {
    const chain = new FakeChain();
    chain.positions = [
      {
        key: "p1",
        symbol: "BTC",
        isLong: false,
        sizeUsd: 300,
        sizeInTokens: 3,
        collateralUsd: 100,
        entryPriceUsd: 100,
        markPriceUsd: 99,
        liquidationPriceUsd: null,
        leverage: 3,
        unrealizedPnlUsd: 3,
      },
      {
        key: "vide",
        symbol: "BTC",
        isLong: true,
        sizeUsd: 0,
        sizeInTokens: 0,
        collateralUsd: 0,
        entryPriceUsd: 0,
        markPriceUsd: 0,
        liquidationPriceUsd: null,
        leverage: 0,
        unrealizedPnlUsd: 0,
      },
    ];
    const venue = new GmxVenue({ chain });
    const state = await venue.getAccountState();

    expect(state.equityUsd).toBe(1000);
    // La position de taille nulle est écartée : elle n'existe plus.
    expect(state.positions).toHaveLength(1);
    const position = state.positions[0];
    expect(position?.side).toBe("short");
    expect(position?.notionalUsd).toBe(300);
    expect(position && "liquidationPrice" in position).toBe(false);
  });
});

describe("GmxVenue — envoi", () => {
  it("convertit la taille en notionnel avec le prix de marque", async () => {
    const chain = new FakeChain();
    const venue = new GmxVenue({ chain });
    await venue.placeOrder(order);

    expect(chain.prepared).toHaveLength(1);
    // 2 unités à 100 $.
    expect(chain.prepared[0]?.sizeDeltaUsd).toBe(200);
    expect(chain.prepared[0]?.leverage).toBe(3);
    expect(chain.prepared[0]?.isDecrease).toBe(false);
  });

  it("transmet le stop à la plateforme plutôt que de le garder pour lui", async () => {
    const chain = new FakeChain();
    const venue = new GmxVenue({ chain });
    await venue.placeOrder({ ...order, stopLossPrice: 88 });
    expect(chain.prepared[0]?.stopLossPriceUsd).toBe(88);
  });

  it("marque un ordre de réduction comme tel", async () => {
    const chain = new FakeChain();
    const venue = new GmxVenue({ chain });
    await venue.placeOrder({ ...order, reduceOnly: true });
    expect(chain.prepared[0]?.isDecrease).toBe(true);
  });

  it("n'envoie RIEN quand le gaz dépasse le plafond", async () => {
    const chain = new FakeChain();
    chain.executionFeeUsd = 5;
    const venue = new GmxVenue({ chain });

    // 5 $ de gaz sur 200 $ de notionnel : 2,5 %, cinq fois le plafond.
    await expect(venue.placeOrder(order)).rejects.toThrow(/frais d'exécution/);
    expect(chain.prepared).toHaveLength(1);
    expect(chain.submitted).toHaveLength(0);
  });

  it("accepte le même gaz si la position est assez grosse", async () => {
    const chain = new FakeChain();
    chain.executionFeeUsd = 5;
    const venue = new GmxVenue({ chain });
    // 5 $ sur 2 000 $ : 0,25 %, sous le plafond.
    await venue.placeOrder({ ...order, size: 20 });
    expect(chain.submitted).toHaveLength(1);
  });

  it("rend la clé d'ordre on-chain comme identifiant", async () => {
    const chain = new FakeChain();
    const venue = new GmxVenue({ chain });
    const result = await venue.placeOrder(order);
    expect(result.venueOrderId).toBe("0xORDER");
    expect(result.clientOrderId).toBe("cid-1");
    expect(result.status).toBe("open");
    expect(result.filledSize).toBe(0);
  });

  it("se rabat sur l'identifiant de requête quand le keeper n'a rien créé", async () => {
    const chain = new FakeChain();
    chain.orderKeys = [];
    const venue = new GmxVenue({ chain });
    const result = await venue.placeOrder(order);
    expect(result.venueOrderId).toBe("req-1");
  });

  it("ne compte comme rempli que ce qui est exécuté", async () => {
    const chain = new FakeChain();
    chain.submitStatus = "executed";
    const venue = new GmxVenue({ chain });
    const result = await venue.placeOrder(order);
    expect(result.status).toBe("filled");
    expect(result.filledSize).toBe(2);
  });

  it("refuse d'envoyer sans prix de référence", async () => {
    const chain = new FakeChain();
    chain.markets = [{ ...chain.markets[0]!, markPriceUsd: 0 }];
    const venue = new GmxVenue({ chain });
    await expect(venue.placeOrder(order)).rejects.toThrow(/prix de référence/);
  });
});

describe("GmxVenue — suivi", () => {
  it("retrouve un ordre par sa clé on-chain", async () => {
    const chain = new FakeChain();
    const venue = new GmxVenue({ chain });
    await venue.placeOrder(order);
    const found = await venue.getOrder("BTC", "0xORDER");
    expect(found.venueOrderId).toBe("0xORDER");
  });

  it("annule par la clé", async () => {
    const chain = new FakeChain();
    const venue = new GmxVenue({ chain });
    await venue.cancelOrder("BTC", "0xORDER");
    expect(chain.cancelled).toEqual([["0xORDER"]]);
  });

  it("liste les ordres ouverts sans inventer d'identifiant client", async () => {
    const chain = new FakeChain();
    chain.openOrders = [
      {
        key: "0xA",
        symbol: "BTC",
        isLong: true,
        sizeDeltaUsd: 100,
        isDecrease: false,
        raw: {},
      },
    ];
    const venue = new GmxVenue({ chain });
    const orders = await venue.listOpenOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]?.venueOrderId).toBe("0xA");
    expect(orders[0]?.clientOrderId).toBe("");
  });
});

describe("measureGmxExecutionFeeUsd", () => {
  it("lit le gaz réel sans rien envoyer", async () => {
    const chain = new FakeChain();
    chain.executionFeeUsd = 0.17;
    const mesuré = await measureGmxExecutionFeeUsd(chain, "BTC");
    expect(mesuré).toBe(0.17);
    expect(chain.submitted).toHaveLength(0);
  });
});
