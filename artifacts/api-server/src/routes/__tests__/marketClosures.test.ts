import { describe, it, expect } from "vitest";
import { computeUpcomingClosures } from "../market";

const find = (closures: ReturnType<typeof computeUpcomingClosures>, date: string, kind: string) =>
  closures.find((c) => c.date === date && c.kind === kind);

describe("computeUpcomingClosures — libellés des fermetures", () => {
  // Point de départ fixe : 1er janvier 2026 → couvre toute l'année 2026.
  const closures = computeUpcomingClosures("2026-01-01", 50);

  it("chaque fermeture porte un libellé non vide", () => {
    expect(closures.length).toBeGreaterThan(0);
    for (const c of closures) {
      expect(typeof c.label).toBe("string");
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("3e lundi de février 2026 : libellés distincts par bourse agrégés", () => {
    // 16 février 2026 = Jour de la famille (TSX) ET Presidents' Day (NASDAQ/NYSE)
    const c = find(closures, "2026-02-16", "holiday");
    expect(c).toBeDefined();
    expect(c!.exchanges).toEqual(["TSX", "NASDAQ_NYSE"]);
    expect(c!.label).toBe("Jour de la famille (TSX) · Presidents' Day (NASDAQ/NYSE)");
  });

  it("Noël 2026 (observé) : libellé commun unique", () => {
    // 25 décembre 2026 tombe un vendredi → observé le jour même, les deux bourses
    const c = find(closures, "2026-12-25", "holiday");
    expect(c).toBeDefined();
    expect(c!.exchanges).toEqual(["TSX", "NASDAQ_NYSE"]);
    expect(c!.label).toBe("Noël");
  });

  it("Action de grâce (CA) 2026 : TSX seulement", () => {
    // 2e lundi d'octobre 2026 = 12 octobre
    const c = find(closures, "2026-10-12", "holiday");
    expect(c).toBeDefined();
    expect(c!.exchanges).toEqual(["TSX"]);
    expect(c!.label).toBe("Action de grâce");
  });

  it("Thanksgiving US 2026 : NASDAQ/NYSE seulement, avec demi-journée le lendemain", () => {
    // 4e jeudi de novembre 2026 = 26 novembre
    const holiday = find(closures, "2026-11-26", "holiday");
    expect(holiday).toBeDefined();
    expect(holiday!.exchanges).toEqual(["NASDAQ_NYSE"]);
    expect(holiday!.label).toBe("Thanksgiving (É.-U.)");

    const early = find(closures, "2026-11-27", "early_close");
    expect(early).toBeDefined();
    expect(early!.label).toBe("Lendemain de Thanksgiving (É.-U.)");
    expect(early!.closesAt).toBe("13:00");
  });

  it("Lendemain de Noël 2026 (Noël un vendredi → lundi 28) : TSX seulement", () => {
    const c = find(closures, "2026-12-28", "holiday");
    expect(c).toBeDefined();
    expect(c!.exchanges).toEqual(["TSX"]);
    expect(c!.label).toBe("Lendemain de Noël");
  });

  it("les dates passées sont exclues et la liste est triée", () => {
    const later = computeUpcomingClosures("2026-07-31", 50);
    expect(later.every((c) => c.date >= "2026-07-31")).toBe(true);
    const dates = later.map((c) => c.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
