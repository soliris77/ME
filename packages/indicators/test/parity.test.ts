import { describe, expect, it } from "vitest";
import { analyzeSignal, type Candle } from "../src";
import fixture from "./fixtures/candles-500.json";

function buildFixtureCandles(): Candle[] {
  let price = fixture.initialPrice;
  return Array.from({ length: fixture.count }, (_, index) => {
    const seasonal = Math.sin(index / 11) * 1.7 + Math.cos(index / 29) * 0.8;
    const drift = index % 37 < 20 ? 0.28 : -0.22;
    const open = price;
    const close = Math.max(1, open + drift + seasonal * 0.18);
    const candle: Candle = {
      timestamp: fixture.startTimestamp + index * fixture.intervalMs,
      open,
      high: Math.max(open, close) + 0.8 + (index % 5) * 0.03,
      low: Math.min(open, close) - 0.7 - (index % 7) * 0.02,
      close,
      volume: 1000 + (index % 31) * 43 + Math.round(Math.abs(seasonal) * 120),
    };
    price = close;
    return candle;
  });
}

function expectClose(actual: unknown, expected: unknown, path = "result"): void {
  if (typeof expected === "number") {
    expect(typeof actual, path).toBe("number");
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(1e-9);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((value, index) => expectClose((actual as unknown[])[index], value, `${path}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object", path).toBe(true);
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      expectClose((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
    }
    return;
  }
  expect(actual, path).toBe(expected);
}

describe("parité du moteur partagé", () => {
  it("reproduit la référence riche sur une fixture figée de 500 bougies", () => {
    const candles = buildFixtureCandles();
    expect(candles).toHaveLength(500);
    expectClose(analyzeSignal(candles), fixture.expected);
  });
});