/**
 * Politique de correspondance de compte pour l'avertissement « stop déjà
 * actif » de TradeModal. Doit refléter EXACTEMENT le garde-fou serveur
 * duplicate_stop (orderEngine) : comptes différents = positions différentes
 * → pas un doublon ; compte inconnu (d'un côté ou de l'autre) = bloquant
 * (fail closed, on préfère avertir à tort qu'empiler deux stops).
 */
import { describe, it, expect } from "vitest";
import { matchesAccount } from "../TradeModal";

describe("matchesAccount — avertissement stop actif scellé au compte sélectionné", () => {
  it("même compte → considéré comme doublon", () => {
    expect(matchesAccount("acct-1", "acct-1")).toBe(true);
  });

  it("compte DIFFÉRENT → pas un doublon (on peut protéger la position de l'autre compte)", () => {
    expect(matchesAccount("acct-OTHER", "acct-1")).toBe(false);
  });

  it("stop existant sans compte (ancien ordre paper) → bloquant, fail closed", () => {
    expect(matchesAccount(null, "acct-1")).toBe(true);
    expect(matchesAccount(undefined, "acct-1")).toBe(true);
  });

  it("aucun compte sélectionné → bloquant, fail closed", () => {
    expect(matchesAccount("acct-1", "")).toBe(true);
  });
});
