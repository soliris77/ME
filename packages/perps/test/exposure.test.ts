import { describe, expect, it } from "vitest";
import { assessExposure } from "../src/exposure";

const base = {
  equityUsd: 300,
  openNotionalsUsd: [] as number[],
  newNotionalUsd: 300,
  maxTotalLeverage: 3,
  maxOpenPositions: 4,
};

describe("assessExposure", () => {
  it("laisse passer la première position sous le plafond", () => {
    const v = assessExposure(base);
    expect(v.ok).toBe(true);
    expect(v.projectedLeverage).toBeCloseTo(1, 10);
  });

  it("refuse quand la somme des notionnels dépasse le plafond agrégé", () => {
    const v = assessExposure({ ...base, openNotionalsUsd: [300, 300, 200] });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("plafond_de_levier_total");
    expect(v.projectedLeverage).toBeCloseTo(3.667, 3);
  });

  it("compte dix positions à 5× comme un seul pari à 50×", () => {
    const dix = Array.from({ length: 10 }, () => 1500);
    const v = assessExposure({
      ...base,
      openNotionalsUsd: dix,
      newNotionalUsd: 0,
      maxOpenPositions: 99,
      maxTotalLeverage: 10,
    });
    expect(v.currentLeverage).toBeCloseTo(50, 6);
    expect(v.ok).toBe(false);
  });

  it("refuse au-delà du nombre de positions ouvertes", () => {
    const v = assessExposure({
      ...base,
      openNotionalsUsd: [10, 10, 10, 10],
      newNotionalUsd: 10,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("trop_de_positions");
  });

  it("ne casse pas sur un capital nul", () => {
    const v = assessExposure({ ...base, equityUsd: 0 });
    expect(v.ok).toBe(false);
  });
});
