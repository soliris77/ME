/**
 * Test d'intégration de l'historique des notifications — s'exécute contre la
 * vraie base (comme webPush.integration.test.ts). Vérifie le contrat central
 * du centre de notifications : chaque déclenchement d'alerte (prix, pattern,
 * signal) écrit une ligne dans `notifications` avec les bons canaux, même si
 * `logNotification` avale ses erreurs (une régression de schéma rendrait
 * l'historique silencieusement vide alors que les envois continueraient).
 * Couvre aussi mark-all-read (read_at NULL → date). Ignoré sans DATABASE_URL.
 *
 * Les entrées/sorties externes (Yahoo, e-mail, SMS, Web Push, préférences)
 * sont mockées : seule la persistance DB est réelle. Les mocks Yahoo ne
 * renvoient des données QUE pour les symboles de test, donc les éventuelles
 * vraies alertes actives de la base ne peuvent pas se déclencher pendant le
 * test.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import express from "express";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

// Symboles improbables, uniques à ce test — utilisés pour le cleanup.
const SYM_PRICE = "ITG31PRICE.TST";
const SYM_PATTERN = "ITG31PATTERN.TST";
const SYM_SIGNAL = "ITG31SIGNAL.TST";
const TEST_SYMBOLS = [SYM_PRICE, SYM_PATTERN, SYM_SIGNAL];

function makeHistory(n: number, close = 100): { date: string | Date; open: number; high: number; low: number; close: number; volume: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.now() - (n - i) * 24 * 60 * 60 * 1000),
    open: close, high: close + 1, low: close - 1, close, volume: 1000,
  }));
}

const h = vi.hoisted(() => ({
  getQuotes: vi.fn(),
  chart: vi.fn(),
  sendEmail: vi.fn(async () => true),
  sendSms: vi.fn(async () => true),
  sendPushToAll: vi.fn(async () => undefined),
  resolveDestinations: vi.fn(async () => ({
    email: "test@example.test",
    phone: "+15550000000",
    sendEmail: true,
    sendSms: true,
  })),
  detectCandlePatterns: vi.fn(),
  computeIndicators: vi.fn(() => ({})),
  analyzeTradingSignals: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getQuotes: h.getQuotes,
  yahooFinance: { chart: h.chart },
}));
vi.mock("../emailClient", () => ({
  sendEmail: h.sendEmail,
  alertEmailHtml: () => "<html/>",
  patternAlertEmailHtml: () => "<html/>",
  signalAlertEmailHtml: () => "<html/>",
}));
vi.mock("../smsClient", () => ({ sendSms: h.sendSms }));
vi.mock("../webPush", () => ({ sendPushToAll: h.sendPushToAll }));
vi.mock("../notificationPrefs", () => ({ resolveDestinations: h.resolveDestinations }));
vi.mock("../patternDetect", () => ({ detectCandlePatterns: h.detectCandlePatterns }));
vi.mock("../signals", () => ({
  computeIndicators: h.computeIndicators,
  analyzeTradingSignals: h.analyzeTradingSignals,
}));

d("historique des notifications (intégration DB)", () => {
  let db: typeof import("@workspace/db").db;
  let alertsTable: typeof import("@workspace/db").alertsTable;
  let notificationsTable: typeof import("@workspace/db").notificationsTable;
  let inArray: typeof import("drizzle-orm").inArray;
  let eq: typeof import("drizzle-orm").eq;

  async function cleanup() {
    await db.delete(notificationsTable).where(inArray(notificationsTable.symbol, TEST_SYMBOLS));
    await db.delete(alertsTable).where(inArray(alertsTable.symbol, TEST_SYMBOLS));
  }

  beforeAll(async () => {
    ({ db, alertsTable, notificationsTable } = await import("@workspace/db"));
    ({ inArray, eq } = await import("drizzle-orm"));
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    const { pool } = await import("@workspace/db");
    await pool.end().catch(() => {});
  });

  it("chaque déclenchement (prix, pattern, signal) écrit une ligne d'historique avec les bons canaux", async () => {
    // --- Arrange : une alerte active de chaque type ---
    const [priceAlert] = await db.insert(alertsTable).values({
      symbol: SYM_PRICE, name: "Test Prix", alertType: "price",
      condition: "above", targetPrice: "100",
    }).returning();
    const [patternAlert] = await db.insert(alertsTable).values({
      symbol: SYM_PATTERN, name: "Test Pattern", alertType: "pattern",
      patternSignal: "haussier", minStrength: "moyen",
    }).returning();
    const [signalAlert] = await db.insert(alertsTable).values({
      symbol: SYM_SIGNAL, name: "Test Signal", alertType: "signal",
      patternSignal: "haussier", minStrength: "moyen",
    }).returning();

    // Prix : cote uniquement pour notre symbole, au-dessus de la cible.
    h.getQuotes.mockResolvedValue([{ symbol: SYM_PRICE, price: 150 }]);
    // Historique OHLC : fourni uniquement pour nos symboles de test — les
    // vraies alertes pattern/signal éventuelles de la base restent inertes.
    h.chart.mockImplementation(async (symbol: string) => {
      if (symbol === SYM_PATTERN) return { quotes: makeHistory(20) };
      if (symbol === SYM_SIGNAL) return { quotes: makeHistory(60) };
      return { quotes: [] };
    });
    h.detectCandlePatterns.mockImplementation((history: unknown[]) => [{
      idx: history.length - 1, name: "Marteau", signal: "haussier", strength: "fort",
      description: "", howToUse: "",
    }]);
    h.analyzeTradingSignals.mockReturnValue({ overall: "FORT ACHAT", score: 80, signals: [] });

    // --- Act ---
    const { checkAlerts } = await import("../../workers/alertWorker");
    await checkAlerts();

    // --- Assert : une ligne d'historique par déclenchement ---
    const rows = await db.select().from(notificationsTable)
      .where(inArray(notificationsTable.symbol, TEST_SYMBOLS));
    expect(rows).toHaveLength(3);

    const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
    const price = bySymbol.get(SYM_PRICE)!;
    expect(price.alertType).toBe("price");
    expect(price.alertId).toBe(priceAlert.id);
    expect(price.title).toContain(SYM_PRICE);
    expect(price.body).toContain("150.00");

    const pattern = bySymbol.get(SYM_PATTERN)!;
    expect(pattern.alertType).toBe("pattern");
    expect(pattern.alertId).toBe(patternAlert.id);
    expect(pattern.body).toContain("Marteau");

    const signal = bySymbol.get(SYM_SIGNAL)!;
    expect(signal.alertType).toBe("signal");
    expect(signal.alertId).toBe(signalAlert.id);
    expect(signal.body).toContain("FORT ACHAT");

    // Canaux : préférences mockées = e-mail + SMS activés avec destinations
    // → "push,email,sms". Nouvellement insérées = non lues.
    for (const row of rows) {
      expect(row.channels).toBe("push,email,sms");
      expect(row.readAt).toBeNull();
      expect(row.sentAt).toBeInstanceOf(Date);
    }
    // Les envois ont bien eu lieu en parallèle de l'historique.
    expect(h.sendEmail).toHaveBeenCalledTimes(3);
    expect(h.sendSms).toHaveBeenCalledTimes(3);
  });

  it("mark-all-read passe read_at de NULL à une date (via la route HTTP)", async () => {
    // Une notification non lue insérée directement (comme le ferait le worker).
    const [inserted] = await db.insert(notificationsTable).values({
      symbol: SYM_PRICE, name: "Test Prix", alertType: "price",
      title: "t", body: "b", channels: "push",
    }).returning();
    expect(inserted.readAt).toBeNull();

    const { default: notificationsRouter } = await import("../../routes/notifications");
    const app = express();
    app.use("/api", notificationsRouter);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/notifications/mark-all-read`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const [after] = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.id, inserted.id));
    expect(after.readAt).toBeInstanceOf(Date);
    expect(after.readAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});
