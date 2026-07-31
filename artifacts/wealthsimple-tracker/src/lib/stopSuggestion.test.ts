import { describe, it, expect } from "vitest";
import { suggestStopLoss, twentyDayLow } from "./stopSuggestion";

const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
const dailyCandles = (lows: (number | null)[]) =>
  lows.map((low, i) => ({ date: day(i), low }));

describe("suggestStopLoss", () => {
  it("retourne null sans prix d'entrée", () => {
    expect(suggestStopLoss(undefined)).toBeNull();
    expect(suggestStopLoss(0)).toBeNull();
  });

  it("utilise le plus bas récent s'il est sous l'entrée", () => {
    const s = suggestStopLoss(100, 93.5, "plus bas 20 jours");
    expect(s).toEqual({ value: 93.5, source: "plus bas 20 jours" });
  });

  it("retombe sur -2 % si le plus bas est au-dessus ou égal à l'entrée", () => {
    const s = suggestStopLoss(100, 101);
    expect(s?.value).toBeCloseTo(98);
    expect(s?.source).toBe("-2 % sous l'entrée");
  });

  it("retombe sur -2 % sans plus bas disponible", () => {
    const s = suggestStopLoss(50);
    expect(s?.value).toBeCloseTo(49);
    expect(s?.source).toBe("-2 % sous l'entrée");
  });
});

describe("twentyDayLow", () => {
  it("retourne le plus bas des 20 dernières bougies quotidiennes", () => {
    const lows = Array.from({ length: 30 }, (_, i) => 100 + i); // min des 20 dernières = 110
    expect(twentyDayLow(dailyCandles(lows))).toBe(110);
  });

  it("retourne undefined si des plus bas sont null ou non positifs (moins de 20 valides)", () => {
    const lows: (number | null)[] = Array.from({ length: 20 }, (_, i) => 100 + i);
    lows[3] = null;
    lows[7] = 0;
    expect(twentyDayLow(dailyCandles(lows))).toBeUndefined();
  });

  it("retourne undefined si l'historique compte moins de 20 bougies quotidiennes", () => {
    expect(twentyDayLow([])).toBeUndefined();
    expect(twentyDayLow(dailyCandles([98, 97]))).toBeUndefined();
    for (const n of [5, 10, 19]) {
      const lows = Array.from({ length: n }, (_, i) => 90 + i);
      expect(twentyDayLow(dailyCandles(lows))).toBeUndefined();
    }
  });

  it("retourne undefined pour un historique intraday (bougies aux 5 min)", () => {
    const intraday = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 5, 14, 30 + i * 5)).toISOString(),
      low: 90 + i,
    }));
    expect(twentyDayLow(intraday)).toBeUndefined();
  });

  it("retourne undefined pour des bougies hebdomadaires/mensuelles", () => {
    const weekly = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i * 7)).toISOString(),
      low: 90 + i,
    }));
    expect(twentyDayLow(weekly)).toBeUndefined();
  });

  it("tolère les week-ends dans un historique quotidien", () => {
    // 4 semaines de jours ouvrables (lun–ven) avec trous de week-end
    const offsets: number[] = [];
    for (let w = 0; w < 4; w++) for (let d = 0; d < 5; d++) offsets.push(w * 7 + d);
    const dates = offsets.map((i) => ({ date: day(i), low: 100 - i }));
    expect(twentyDayLow(dates)).toBe(100 - offsets[offsets.length - 1]);
  });
});
