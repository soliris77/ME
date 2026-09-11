/**
 * Tests des garde-fous de risque — checkOrderRisk (risk.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 * checkOrderRisk est la SEULE barrière entre un signal et un ordre trop gros,
 * une surexposition du portefeuille ou un ordre hors des heures de marché.
 * Approche de mocks db/drizzle reprise de orderEngine.test.ts.
 *
 * Le temps est figé (vi.setSystemTime) pour rendre le contrôle "marché ouvert"
 * déterministe : mardi 28 juillet 2026, 11h00 ET (marché ouvert, aucun férié).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mocks hissés ──────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const ordersTable = { mode: Symbol("orders.mode"), $inferSelect: undefined };

  const state = {
    /** Lignes renvoyées par SELECT ... FROM orders. */
    orders: [] as Record<string, unknown>[],
  };

  const thenable = (rows: unknown[]) => ({
    where: () => thenable(rows),
    limit: (n: number) => thenable(rows.slice(0, n)),
    orderBy: () => thenable(rows),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
  });

  const db = {
    select: () => ({
      from: (table: unknown) => thenable(table === ordersTable ? state.orders : []),
    }),
  };

  return {
    state,
    db,
    ordersTable,
    getQuotes: vi.fn(),
    getRiskSettings: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  ordersTable: h.ordersTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));
vi.mock("../yahoo", () => ({ getQuotes: h.getQuotes }));
vi.mock("../settings", () => ({ getRiskSettings: h.getRiskSettings }));
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  checkOrderRisk,
  getEarlyCloseDays,
  getExchangeForSymbol,
  isMarketOpen,
  isSymbolTradeableForAsset,
  type BrokerPosition,
  type RiskCheckInput,
} from "../risk";

describe("crypto market limits fail closed", () => {
  it("rejects missing adapter and adapter limit errors", async () => {
    await expect(isSymbolTradeableForAsset("BTC-USD", "crypto")).resolves.toBe(false);
    await expect(isSymbolTradeableForAsset("BTC-USD", "crypto", {
      getMarketLimits: vi.fn().mockRejectedValue(new Error("exchange unavailable")),
    })).resolves.toBe(false);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
// Mardi 28 juillet 2026, 15:00 UTC = 11:00 ET → NASDAQ/NYSE et TSX ouverts.
const MARKET_OPEN_NOW = new Date("2026-07-28T15:00:00Z");
// Samedi 25 juillet 2026, 15:00 UTC → week-end.
const WEEKEND_NOW = new Date("2026-07-25T15:00:00Z");
// Mardi 28 juillet 2026, 23:00 UTC = 19:00 ET → hors session.
const AFTER_HOURS_NOW = new Date("2026-07-28T23:00:00Z");
// Vendredi 3 juillet 2026 (Independence Day observé), 15:00 UTC → férié US.
const US_HOLIDAY_NOW = new Date("2026-07-03T15:00:00Z");

const baseInput: RiskCheckInput = {
  signalId: "sig-1",
  symbol: "AAPL",
  side: "BUY",
  quantity: 10,
  mode: "paper",
};

function quote(symbol: string, price: number, currency = "USD") {
  return { symbol, price, currency };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MARKET_OPEN_NOW);
  h.state.orders.length = 0;
  h.getRiskSettings.mockResolvedValue({ maxOrderValue: 5000, maxPortfolioExposure: 25000 });
  h.getQuotes.mockResolvedValue([quote("AAPL", 100)]);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 1) Symboles non supportés ────────────────────────────────────────────────
describe("checkOrderRisk — bourse non supportée", () => {
  it.each([
    ["indice", "^GSPC"],
    ["future", "GC=F"],
    ["forex", "EURUSD=X"],
    ["crypto", "BTC-USD"],
    ["bourse européenne", "AIR.PA"],
    ["bourse asiatique", "7203.T"],
  ])("%s (%s) → refus exchange_not_supported, sans appel de prix", async (_label, symbol) => {
    const res = await checkOrderRisk({ ...baseInput, symbol });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("exchange_not_supported");
      expect(res.details).toMatchObject({ symbol });
    }
    expect(h.getQuotes).not.toHaveBeenCalled();
  });

  it("les symboles TSX (.TO) et US sans suffixe sont supportés", () => {
    expect(getExchangeForSymbol("SHOP.TO")).toBe("TSX");
    expect(getExchangeForSymbol("AAPL")).toBe("NASDAQ_NYSE");
    expect(getExchangeForSymbol("BABA")).toBe("NASDAQ_NYSE"); // ADR sur NYSE
  });
});

// ── 2) Heures de marché ──────────────────────────────────────────────────────
describe("checkOrderRisk — marché fermé", () => {
  it("week-end → refus market_closed, sans appel de prix", async () => {
    vi.setSystemTime(WEEKEND_NOW);

    const res = await checkOrderRisk(baseInput);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("market_closed");
      expect(res.message).toContain("week-end");
    }
    expect(h.getQuotes).not.toHaveBeenCalled();
  });

  it("hors session (19h ET) → refus market_closed", async () => {
    vi.setSystemTime(AFTER_HOURS_NOW);

    const res = await checkOrderRisk(baseInput);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("market_closed");
  });

  it("jour férié US (Independence Day observé) → refus market_closed pour un titre US", async () => {
    vi.setSystemTime(US_HOLIDAY_NOW);

    const res = await checkOrderRisk(baseInput);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("market_closed");
      expect(res.message).toContain("férié");
    }
  });

  it("demi-journée (veille de Noël 2026, jeudi) : refus après 13h ET avec message clair", async () => {
    // Jeudi 24 décembre 2026, 19:00 UTC = 14:00 ET (EST) → après la fermeture anticipée.
    vi.setSystemTime(new Date("2026-12-24T19:00:00Z"));

    const res = await checkOrderRisk(baseInput);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("market_closed");
      expect(res.message).toContain("13h00");
      expect(res.message).toContain("fermeture anticipée");
    }
    expect(h.getQuotes).not.toHaveBeenCalled();
  });

  it("demi-journée (veille de Noël) : encore ouvert AVANT 13h ET", () => {
    // Jeudi 24 décembre 2026, 16:00 UTC = 11:00 ET (EST).
    const morning = new Date("2026-12-24T16:00:00Z");
    expect(isMarketOpen("AAPL", morning).open).toBe(true);
    expect(isMarketOpen("SHOP.TO", morning).open).toBe(true);
    // 14:00 ET → fermé pour les deux bourses (24 déc. = demi-journée TSX aussi).
    const afternoon = new Date("2026-12-24T19:00:00Z");
    expect(isMarketOpen("AAPL", afternoon).open).toBe(false);
    expect(isMarketOpen("SHOP.TO", afternoon).open).toBe(false);
  });

  it("lendemain de Thanksgiving US (27 nov. 2026) : NASDAQ/NYSE ferme à 13h, TSX reste ouvert jusqu'à 16h", () => {
    // Vendredi 27 novembre 2026, 19:00 UTC = 14:00 ET (EST).
    const afternoon = new Date("2026-11-27T19:00:00Z");
    const us = isMarketOpen("AAPL", afternoon);
    expect(us.open).toBe(false);
    expect(us.message).toContain("fermeture anticipée");
    expect(isMarketOpen("SHOP.TO", afternoon).open).toBe(true);
  });

  it("veille de l'Independence Day (3 juillet 2025, jeudi) : NASDAQ/NYSE ferme à 13h ET", () => {
    // Jeudi 3 juillet 2025, 18:00 UTC = 14:00 ET (EDT).
    const afternoon = new Date("2025-07-03T18:00:00Z");
    expect(isMarketOpen("AAPL", afternoon).open).toBe(false);
    // 12:00 ET → encore ouvert.
    expect(isMarketOpen("AAPL", new Date("2025-07-03T16:00:00Z")).open).toBe(true);
  });

  it("getEarlyCloseDays : exclut les candidats déjà fériés ou tombant un week-end", () => {
    // 2026 : le 4 juillet tombe un samedi → le 3 juillet est un férié observé
    // (pas une demi-journée).
    expect(getEarlyCloseDays(2026, "NASDAQ_NYSE").has("2026-07-03")).toBe(false);
    // 2021 : Noël tombe un samedi → le 24 décembre est un férié observé.
    expect(getEarlyCloseDays(2021, "NASDAQ_NYSE").has("2021-12-24")).toBe(false);
    expect(getEarlyCloseDays(2021, "TSX").has("2021-12-24")).toBe(false);
    // 2022 : le 24 décembre tombe un samedi → aucune séance, pas de demi-journée.
    expect(getEarlyCloseDays(2022, "NASDAQ_NYSE").has("2022-12-24")).toBe(false);
    // Cas normaux présents : 24 déc. 2026 (jeudi) et lendemain de Thanksgiving 2026.
    expect(getEarlyCloseDays(2026, "NASDAQ_NYSE").has("2026-12-24")).toBe(true);
    expect(getEarlyCloseDays(2026, "TSX").has("2026-12-24")).toBe(true);
    expect(getEarlyCloseDays(2026, "NASDAQ_NYSE").has("2026-11-27")).toBe(true);
    // Le TSX n'observe pas le lendemain de Thanksgiving US.
    expect(getEarlyCloseDays(2026, "TSX").has("2026-11-27")).toBe(false);
  });

  it("Fête du Canada (1er juillet) : TSX fermé mais NASDAQ/NYSE ouvert", () => {
    // Mercredi 1er juillet 2026, 11h ET
    const canadaDay = new Date("2026-07-01T15:00:00Z");
    expect(isMarketOpen("SHOP.TO", canadaDay).open).toBe(false);
    expect(isMarketOpen("AAPL", canadaDay).open).toBe(true);
  });
});

// ── 3) Prix indisponible ─────────────────────────────────────────────────────
describe("checkOrderRisk — prix courant", () => {
  it("aucune cotation trouvée → refus price_unavailable", async () => {
    h.getQuotes.mockResolvedValue([]);

    const res = await checkOrderRisk(baseInput);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("price_unavailable");
  });
});

// ── 4) Valeur max par ordre ──────────────────────────────────────────────────
describe("checkOrderRisk — limite de valeur par ordre", () => {
  it("valeur > maxOrderValue → refus order_value_exceeded avec détails corrects", async () => {
    // 60 × 100 $ = 6 000 $ > 5 000 $
    const res = await checkOrderRisk({ ...baseInput, quantity: 60 });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("order_value_exceeded");
      expect(res.details).toMatchObject({
        orderValue: 6000,
        maxOrderValue: 5000,
        currency: "USD",
        quantity: 60,
        price: 100,
      });
    }
  });

  it("le prix utilisé est le prix LIVE, jamais celui du client (quantité limite)", async () => {
    // 50 × 100 $ = 5 000 $ = limite exacte → accepté (strictement supérieur requis)
    const res = await checkOrderRisk({ ...baseInput, quantity: 50 });

    expect(res.ok).toBe(true);
  });
});

// ── 5) Exposition max du portefeuille ────────────────────────────────────────
describe("checkOrderRisk — exposition max du portefeuille", () => {
  it("BUY dépassant l'exposition max (positions courtier fournies, mode live) → refus", async () => {
    const brokerPositions: BrokerPosition[] = [
      { symbol: "MSFT", units: 100, currency: "USD", price: 240 }, // 24 000 $ USD
    ];
    // + 10 × 100 $ = 25 000 $... non : 24 000 + 1 000 = 25 000 ≤ 25 000 → ok.
    // On prend 20 unités : 24 000 + 2 000 = 26 000 > 25 000 → refus.
    const res = await checkOrderRisk({
      ...baseInput,
      mode: "live",
      quantity: 20,
      brokerPositions,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("portfolio_exposure_exceeded");
      expect(res.details).toMatchObject({
        currentExposure: 24000,
        projectedExposure: 26000,
        maxExposure: 25000,
        currency: "USD",
      });
    }
  });

  it("l'exposition broker est cumulée PAR DEVISE — une devise différente ne compte pas", async () => {
    const brokerPositions: BrokerPosition[] = [
      { symbol: "SHOP.TO", units: 300, currency: "CAD", price: 100 }, // 30 000 $ CAD
    ];
    // Achat en USD : l'exposition CAD n'entre pas dans le calcul → accepté.
    const res = await checkOrderRisk({ ...baseInput, mode: "live", brokerPositions });

    expect(res.ok).toBe(true);
  });

  it("BUY dépassant l'exposition max SANS positions courtier (fallback table orders) → refus", async () => {
    // Position nette paper : 240 MSFT achetées (BUY 300, SELL 60)
    h.state.orders.push(
      { symbol: "MSFT", side: "BUY", quantity: 300, filledQuantity: null, status: "simulated", mode: "paper" },
      { symbol: "MSFT", side: "SELL", quantity: 60, filledQuantity: null, status: "simulated", mode: "paper" },
      // Statut non pertinent → ignoré
      { symbol: "NVDA", side: "BUY", quantity: 999, filledQuantity: null, status: "rejected", mode: "paper" },
    );
    h.getQuotes.mockImplementation(async (symbols: string[]) =>
      symbols.map((s) => (s === "MSFT" ? quote("MSFT", 100) : quote(s, 100))),
    );

    // Exposition actuelle : 240 × 100 = 24 000 $. Achat 20 × 100 = 2 000 $ → 26 000 > 25 000.
    const res = await checkOrderRisk({ ...baseInput, quantity: 20 });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("portfolio_exposure_exceeded");
      expect(res.details).toMatchObject({ currentExposure: 24000, projectedExposure: 26000 });
    }
  });

  it("cotation ABSENTE pour une position ouverte (getQuotes renvoie []) → refus (fail closed)", async () => {
    // Comportement réel de getQuotes en cas de panne Yahoo : il intercepte
    // l'erreur et renvoie simplement moins (ou zéro) de cotations — il ne
    // rejette pas. Une position sans prix ne doit JAMAIS être ignorée : cela
    // sous-estimerait l'exposition et laisserait passer un BUY dangereux.
    h.state.orders.push({
      symbol: "MSFT", side: "BUY", quantity: 10, filledQuantity: null, status: "simulated", mode: "paper",
    });
    h.getQuotes
      .mockResolvedValueOnce([quote("AAPL", 100)]) // prix du symbole de l'ordre
      .mockResolvedValueOnce([]); // exposition : aucune cotation renvoyée

    await expect(checkOrderRisk(baseInput)).rejects.toThrow(/MSFT/);
  });

  it("cotation absente pour UNE des positions (liste partielle) → refus (fail closed)", async () => {
    h.state.orders.push(
      { symbol: "MSFT", side: "BUY", quantity: 10, filledQuantity: null, status: "simulated", mode: "paper" },
      { symbol: "NVDA", side: "BUY", quantity: 5, filledQuantity: null, status: "simulated", mode: "paper" },
    );
    h.getQuotes
      .mockResolvedValueOnce([quote("AAPL", 100)]) // prix du symbole de l'ordre
      .mockResolvedValueOnce([quote("MSFT", 100)]); // NVDA manquant

    await expect(checkOrderRisk(baseInput)).rejects.toThrow(/NVDA/);
  });

  it("getQuotes qui rejette pendant le calcul d'exposition → refus (défense en profondeur)", async () => {
    h.state.orders.push({
      symbol: "MSFT", side: "BUY", quantity: 10, filledQuantity: null, status: "simulated", mode: "paper",
    });
    h.getQuotes
      .mockResolvedValueOnce([quote("AAPL", 100)])
      .mockRejectedValueOnce(new Error("yahoo down"));

    await expect(checkOrderRisk(baseInput)).rejects.toThrow(/exposition/i);
  });

  it("une SELL n'est PAS soumise au contrôle d'exposition", async () => {
    const brokerPositions: BrokerPosition[] = [
      { symbol: "AAPL", units: 500, currency: "USD", price: 100 }, // 50 000 $ — déjà au-delà de la limite
    ];

    const res = await checkOrderRisk({
      ...baseInput,
      side: "SELL",
      mode: "live",
      brokerPositions,
    });

    expect(res.ok).toBe(true);
  });
});

// ── 6) Ordre valide ──────────────────────────────────────────────────────────
describe("checkOrderRisk — ordre valide", () => {
  it("ordre BUY valide → ok avec livePrice/orderValue/currency corrects", async () => {
    h.getQuotes.mockResolvedValue([quote("AAPL", 123.45)]);

    const res = await checkOrderRisk(baseInput);

    expect(res).toEqual({
      ok: true,
      livePrice: 123.45,
      currency: "USD",
      orderValue: 10 * 123.45,
    });
  });

  it("ordre TSX valide en CAD → devise CAD renvoyée", async () => {
    h.getQuotes.mockResolvedValue([quote("SHOP.TO", 80, "CAD")]);

    const res = await checkOrderRisk({ ...baseInput, symbol: "SHOP.TO" });

    expect(res).toEqual({ ok: true, livePrice: 80, currency: "CAD", orderValue: 800 });
  });
});
