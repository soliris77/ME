/**
 * Tests du coupe-circuit de perte journalière — P&L réalisé (appariement de
 * lots, coût moyen) + mapping des statuts SnapTrade.
 * Exécution : pnpm run test:daily-loss (via tsx, sans DB).
 */
import assert from "node:assert/strict";
import { computeRealizedDailyPnL, mapSnaptradeStatus, snaptradeRecordKeys, syncWindowDays } from "../src/workers/autoTradeWorker.ts";
import { extractSnaptradeOrderId, validateLiveOrderPrerequisites } from "../src/lib/orderEngine.ts";

const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const yesterday = new Date(today.getTime() - 86400000);
const now = new Date(today.getTime() + 3600000);

const o = (side, symbol, price, qty, createdAt, extra = {}) => ({
  symbol, side, quantity: String(qty), filledQuantity: null,
  fillPrice: String(price), expectedPrice: null, createdAt, ...extra,
});

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`OK  ${name}`); };

t("aller-retour gagnant le même jour → +10 (jamais compté comme perte)", () => {
  const r = computeRealizedDailyPnL([o("BUY", "AAPL", 100, 1, now), o("SELL", "AAPL", 110, 1, now)], today);
  assert.equal(r.realizedPnL, 10);
  assert.equal(r.unmatchedSells.length, 0);
});

t("aller-retour perdant → -20", () => {
  assert.equal(computeRealizedDailyPnL([o("BUY", "X", 100, 2, now), o("SELL", "X", 90, 2, now)], today).realizedPnL, -20);
});

t("entrée la veille, vente aujourd'hui à perte → perte comptée (-50)", () => {
  assert.equal(computeRealizedDailyPnL([o("BUY", "Y", 50, 10, yesterday), o("SELL", "Y", 45, 10, now)], today).realizedPnL, -50);
});

t("vente d'hier exclue du P&L du jour", () => {
  assert.equal(computeRealizedDailyPnL([o("BUY", "Z", 50, 10, yesterday), o("SELL", "Z", 40, 10, yesterday)], today).realizedPnL, 0);
});

t("achat seul → 0 (un achat n'est pas une perte)", () => {
  assert.equal(computeRealizedDailyPnL([o("BUY", "W", 100, 5, now)], today).realizedPnL, 0);
});

t("vente sans base de coût locale → P&L exclu et signalé", () => {
  const r = computeRealizedDailyPnL([o("SELL", "Q", 100, 5, now)], today);
  assert.equal(r.realizedPnL, 0);
  assert.deepEqual(r.unmatchedSells, [{ symbol: "Q", quantity: 5 }]);
});

t("coût moyen sur achats multiples → (105-110)×1 = -5", () => {
  assert.equal(computeRealizedDailyPnL([
    o("BUY", "M", 100, 1, yesterday), o("BUY", "M", 120, 1, yesterday), o("SELL", "M", 105, 1, now),
  ], today).realizedPnL, -5);
});

t("vente dépassant la position → seule la portion appariée compte, le reste signalé", () => {
  const r = computeRealizedDailyPnL([o("BUY", "P", 100, 1, now), o("SELL", "P", 90, 2, now)], today);
  assert.equal(r.realizedPnL, -10);
  assert.deepEqual(r.unmatchedSells, [{ symbol: "P", quantity: 1 }]);
});

t("ordre paper (simulated) : expectedPrice utilisé quand fillPrice absent", () => {
  const paper = (side, sym, price, qty, at) => ({ symbol: sym, side, quantity: String(qty), filledQuantity: null, fillPrice: null, expectedPrice: String(price), createdAt: at });
  assert.equal(computeRealizedDailyPnL([paper("BUY", "R", 100, 3, now), paper("SELL", "R", 95, 3, now)], today).realizedPnL, -15);
});

t("fill partiel : filledQuantity prime sur quantity", () => {
  const partial = { symbol: "S", side: "SELL", quantity: "10", filledQuantity: "4", fillPrice: "90", expectedPrice: null, createdAt: now };
  assert.equal(computeRealizedDailyPnL([o("BUY", "S", 100, 10, yesterday), partial], today).realizedPnL, -40);
});

t("fills incrémentaux : partiel (4) puis exécution finale re-synchronisée (10) → perte totale -100", () => {
  // Après re-sync, la ligne unique de l'ordre porte la quantité finale : le
  // P&L doit refléter l'exécution complète, pas la quantité partielle initiale.
  const final = { symbol: "T", side: "SELL", quantity: "10", filledQuantity: "10", fillPrice: "90", expectedPrice: null, createdAt: now };
  assert.equal(computeRealizedDailyPnL([o("BUY", "T", 100, 10, yesterday), final], today).realizedPnL, -100);
});

t("seuil exact : perte égale au seuil ne déclenche pas, au-delà oui (contrat < -maxLoss)", () => {
  const maxLoss = 50;
  const exactly = computeRealizedDailyPnL([o("BUY", "U", 100, 1, yesterday), o("SELL", "U", 50, 1, now)], today).realizedPnL;
  assert.equal(exactly, -50);
  assert.ok(!(exactly < -maxLoss), "à seuil exact : pas de déclenchement");
  const beyond = computeRealizedDailyPnL([o("BUY", "V", 100, 1, yesterday), o("SELL", "V", 49, 1, now)], today).realizedPnL;
  assert.ok(beyond < -maxLoss, "au-delà du seuil : déclenchement");
});

t("mapping des statuts SnapTrade → statuts locaux", () => {
  assert.equal(mapSnaptradeStatus("EXECUTED"), "filled");
  assert.equal(mapSnaptradeStatus("PARTIAL"), "partially_filled");
  assert.equal(mapSnaptradeStatus("PARTIALLY_EXECUTED"), "partially_filled");
  assert.equal(mapSnaptradeStatus("REJECTED"), "rejected");
  assert.equal(mapSnaptradeStatus("FAILED"), "rejected");
  assert.equal(mapSnaptradeStatus("CANCELED"), "error");
  assert.equal(mapSnaptradeStatus("PARTIAL_CANCELED"), "error");
  assert.equal(mapSnaptradeStatus("EXPIRED"), "error");
  assert.equal(mapSnaptradeStatus("PENDING"), null);
  assert.equal(mapSnaptradeStatus("ACCEPTED"), null);
  assert.equal(mapSnaptradeStatus(undefined), null);
});

t("extraction d'ID : AccountOrderRecord (premier niveau)", () => {
  assert.equal(extractSnaptradeOrderId({ brokerage_order_id: "B-123", status: "PENDING" }), "B-123");
  assert.equal(extractSnaptradeOrderId({ id: "st-uuid-1" }), "st-uuid-1");
});

t("extraction d'ID : OrderUpdatedResponse (imbriqué sous order)", () => {
  assert.equal(extractSnaptradeOrderId({ order: { brokerage_order_id: "B-456" } }), "B-456");
  assert.equal(extractSnaptradeOrderId({ order: { id: "st-uuid-2" } }), "st-uuid-2");
  assert.equal(extractSnaptradeOrderId({}), null);
  assert.equal(extractSnaptradeOrderId(null), null);
});

t("appariement : clé sur brokerage_order_id ET id SnapTrade (formes divergentes)", () => {
  // Soumission → l'app a stocké l'id interne SnapTrade ; la liste des ordres
  // indexe par brokerage_order_id : les DEUX clés doivent résoudre.
  const rec = { brokerage_order_id: "B-789", id: "st-uuid-3", status: "EXECUTED" };
  const keys = snaptradeRecordKeys(rec);
  assert.deepEqual(keys, ["B-789", "st-uuid-3"]);
  const index = new Map(keys.map((k) => [k, rec]));
  assert.equal(index.get("st-uuid-3"), rec, "ID interne stocké à la soumission → retrouvé");
  assert.equal(index.get("B-789"), rec, "brokerage_order_id stocké → retrouvé");
  assert.deepEqual(snaptradeRecordKeys({ brokerage_order_id: "X", id: "X" }), ["X"], "pas de doublon");
});

t("fenêtre de sync : couvre un ordre non résolu de plus de 7 jours (plafond 90)", () => {
  const nowD = new Date("2026-07-31T12:00:00Z");
  assert.equal(syncWindowDays(null, nowD), 7);
  assert.equal(syncWindowDays(new Date("2026-07-30T12:00:00Z"), nowD), 7, "récent → minimum 7");
  const d20 = syncWindowDays(new Date("2026-07-11T12:00:00Z"), nowD);
  assert.ok(d20 >= 21, `ordre de 20 jours couvert (${d20})`);
  assert.equal(syncWindowDays(new Date("2025-01-01T00:00:00Z"), nowD), 90, "plafonné à 90");
});

t("ordre live sans connexion courtier → rejeté (fail closed)", () => {
  const r = validateLiveOrderPrerequisites(null, "acct-1");
  assert.equal(r?.status, "rejected");
  assert.equal(r?.reason, "broker_not_connected");
});

t("ordre live sans accountId → rejeté avant toute insertion (brokerAccountId toujours persisté)", () => {
  const r = validateLiveOrderPrerequisites({ id: "conn-1" }, undefined);
  assert.equal(r?.status, "rejected");
  assert.equal(r?.reason, "account_required");
  assert.equal(validateLiveOrderPrerequisites({ id: "conn-1" }, "acct-1"), null, "prérequis remplis → pas de rejet");
});

console.log(`\n${n} tests passés.`);
