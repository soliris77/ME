import { describe, expect, it } from "vitest";
import {
  alignSizeDown,
  decimalsOf,
  maintenanceMarginFromMaxLeverage,
} from "../src/venue";

describe("decimalsOf", () => {
  it("compte les décimales d'un pas", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.1)).toBe(1);
    expect(decimalsOf(0.001)).toBe(3);
    expect(decimalsOf(0.00001)).toBe(5);
  });

  it("ne casse pas sur un pas absurde", () => {
    expect(decimalsOf(0)).toBe(0);
    expect(decimalsOf(-1)).toBe(0);
    expect(decimalsOf(Number.NaN)).toBe(0);
  });
});

describe("alignSizeDown", () => {
  it("arrondit vers le bas, jamais vers le haut", () => {
    expect(alignSizeDown(1.2345, 0.001)).toBe(1.234);
    expect(alignSizeDown(0.9999, 0.001)).toBe(0.999);
    expect(alignSizeDown(7.9, 1)).toBe(7);
  });

  it("laisse passer une taille déjà alignée", () => {
    expect(alignSizeDown(1.234, 0.001)).toBe(1.234);
    expect(alignSizeDown(0.3, 0.1)).toBe(0.3);
  });

  it("ne laisse pas la virgule flottante manger un pas entier", () => {
    // 0.1 + 0.2 = 0.30000000000000004 ; l'alignement ne doit pas donner 0.2.
    expect(alignSizeDown(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(alignSizeDown(3 * 1.1, 0.1)).toBe(3.3);
  });

  it("rend zéro quand la taille est sous le pas", () => {
    expect(alignSizeDown(0.0009, 0.001)).toBe(0);
  });

  it("laisse la taille intacte sur un pas nul", () => {
    expect(alignSizeDown(1.2345, 0)).toBe(1.2345);
  });
});

describe("maintenanceMarginFromMaxLeverage", () => {
  it("suit la règle mmf = 1 / (2 × levier max)", () => {
    expect(maintenanceMarginFromMaxLeverage(20)).toBeCloseTo(0.025, 10);
    expect(maintenanceMarginFromMaxLeverage(50)).toBeCloseTo(0.01, 10);
    expect(maintenanceMarginFromMaxLeverage(3)).toBeCloseTo(1 / 6, 10);
  });

  it("reste prudente sur une entrée dégénérée", () => {
    expect(maintenanceMarginFromMaxLeverage(0)).toBe(0.5);
  });
});
