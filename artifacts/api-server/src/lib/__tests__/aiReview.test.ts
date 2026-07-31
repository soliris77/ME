/**
 * Tests unitaires du réviseur LOCAL (gratuit, déterministe) et du repli de
 * getAiSecondOpinion. Aucun appel réseau : localSecondOpinion est pur.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { localSecondOpinion, getAiSecondOpinion, type AiReviewContext } from "../aiReview";

function ctx(over: Partial<AiReviewContext> = {}): AiReviewContext {
  return {
    symbol: "AAPL",
    side: "BUY",
    quantity: 2,
    price: 100,
    changePercent: 0,
    signalScore: 70,
    signalVerdict: "FORT ACHAT",
    ruleName: "Apple",
    sideMode: "both",
    minScore: 60,
    recentOutcomes: [],
    recentTradeOutcomes: [],
    source: "technical",
    ...over,
  };
}

describe("localSecondOpinion — règles de blocage (signaux d'alerte clairs)", () => {
  it("APPROUVE un contexte sain", () => {
    const r = localSecondOpinion(ctx());
    expect(r.verdict).toBe("approve");
    expect(r.reason).toMatch(/aucun signal d'alerte/i);
  });

  it("BLOQUE un achat avec score négatif (signal contradictoire)", () => {
    const r = localSecondOpinion(ctx({ side: "BUY", signalScore: -40, signalVerdict: "VENTE" }));
    expect(r.verdict).toBe("block");
    expect(r.reason).toMatch(/contradictoire/i);
  });

  it("BLOQUE une vente avec score positif (signal contradictoire)", () => {
    const r = localSecondOpinion(ctx({ side: "SELL", signalScore: 40, signalVerdict: "ACHAT" }));
    expect(r.verdict).toBe("block");
    expect(r.reason).toMatch(/contradictoire/i);
  });

  it("BLOQUE un achat avec verdict VENTE même si le score est absent", () => {
    const r = localSecondOpinion(ctx({ side: "BUY", signalScore: null, signalVerdict: "FORTE VENTE" }));
    expect(r.verdict).toBe("block");
    expect(r.reason).toMatch(/contradictoire/i);
  });

  it("BLOQUE un achat pendant un plongeon violent (changePercent ≤ -8 %)", () => {
    const r = localSecondOpinion(ctx({ side: "BUY", changePercent: -9.5 }));
    expect(r.verdict).toBe("block");
    expect(r.reason).toMatch(/mouvement extrême|plonge/i);
  });

  it("BLOQUE une vente pendant une flambée violente (changePercent ≥ +8 %)", () => {
    const r = localSecondOpinion(ctx({ side: "SELL", signalScore: -70, signalVerdict: "FORTE VENTE", changePercent: 8.5 }));
    expect(r.verdict).toBe("block");
    expect(r.reason).toMatch(/mouvement extrême|bondit/i);
  });

  it("N'invoque PAS le mouvement extrême si le sens joue en faveur du trade", () => {
    // Achat pendant une flambée : pas de blocage « mouvement extrême ».
    const r = localSecondOpinion(ctx({ side: "BUY", changePercent: 9 }));
    expect(r.verdict).toBe("approve");
  });

  it("BLOQUE après 3 pertes/échecs consécutifs (série perdante)", () => {
    const r = localSecondOpinion(ctx({ recentTradeOutcomes: ["loss", "loss", "loss", "win"] }));
    expect(r.verdict).toBe("block");
    expect(r.reason).toMatch(/3 trades perdants d'affilée/i);
  });

  it("N'invoque PAS la série perdante si la 3e n'est pas une perte", () => {
    const r = localSecondOpinion(ctx({ recentTradeOutcomes: ["loss", "loss", "win"] }));
    expect(r.verdict).toBe("approve");
  });

  it("BLOQUE un score à peine au seuil ET forte volatilité (≥ 5 %)", () => {
    const r = localSecondOpinion(ctx({ signalScore: 62, minScore: 60, changePercent: 6 }));
    expect(r.verdict).toBe("block");
    expect(r.reason).toMatch(/seuil/i);
  });

  it("APPROUVE un score confortablement au-dessus du seuil malgré la volatilité", () => {
    const r = localSecondOpinion(ctx({ signalScore: 90, minScore: 60, changePercent: 6 }));
    expect(r.verdict).toBe("approve");
  });

  it("toutes les raisons sont en français et non vides", () => {
    for (const c of [
      ctx(),
      ctx({ side: "BUY", signalScore: -40 }),
      ctx({ side: "BUY", changePercent: -10 }),
      ctx({ recentTradeOutcomes: ["loss", "loss", "loss"] }),
      ctx({ signalScore: 62, minScore: 60, changePercent: 6 }),
    ]) {
      const r = localSecondOpinion(c);
      expect(r.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("getAiSecondOpinion — gratuit par défaut, repli sur le local", () => {
  const origKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (origKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origKey;
    vi.restoreAllMocks();
  });

  it("sans OPENAI_API_KEY → utilise le réviseur local (jamais null)", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await getAiSecondOpinion(ctx({ side: "BUY", signalScore: -50 }));
    expect(r).not.toBeNull();
    expect(r!.verdict).toBe("block");
  });

  it("avec clé mais OpenAI en erreur → repli local (pas null)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau")));
    const r = await getAiSecondOpinion(ctx());
    expect(r).not.toBeNull();
    expect(r!.verdict).toBe("approve");
  });
});
