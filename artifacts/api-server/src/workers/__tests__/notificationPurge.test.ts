/**
 * Tests de la purge de l'historique des notifications (purgeOldNotifications).
 * ─────────────────────────────────────────────────────────────────────────────
 * Politique de rétention :
 *   1. Les entrées LUES de plus de 90 jours sont supprimées.
 *   2. Au-delà de 1000 entrées au total, les plus anciennes entrées LUES sont
 *      supprimées.
 *   3. Les entrées NON LUES ne sont jamais purgées.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = { id: number; sentAt: Date; readAt: Date | null };

const h = vi.hoisted(() => {
  const notificationsTable = {
    id: Symbol("notifications.id"),
    sentAt: Symbol("notifications.sentAt"),
    readAt: Symbol("notifications.readAt"),
    $inferSelect: undefined,
  };
  const alertsTable = { $inferSelect: undefined };

  const state = {
    rows: [] as Row[],
  };

  // Fake ultra-simple : on interprète les conditions par leur forme.
  // - delete().where(cond) : cond est un prédicat qu'on a capturé via nos faux
  //   opérateurs drizzle (and/lt/isNotNull/inArray) ci-dessous.
  type Pred = (r: Row) => boolean;

  const db = {
    delete: (_table: unknown) => ({
      where: (pred: Pred) => ({
        returning: () => {
          const victims = state.rows.filter(pred);
          state.rows = state.rows.filter((r) => !pred(r));
          return Promise.resolve(victims.map((r) => ({ id: r.id })));
        },
      }),
    }),
    select: (fields?: Record<string, unknown>) => ({
      from: (_table: unknown) => {
        const isCount = fields && "count" in fields;
        const base = {
          where: (pred: Pred) => ({
            orderBy: () => ({
              limit: (n: number) =>
                Promise.resolve(
                  [...state.rows]
                    .filter(pred)
                    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
                    .slice(0, n)
                    .map((r) => ({ id: r.id })),
                ),
            }),
          }),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(isCount ? [{ count: state.rows.length }] : state.rows).then(res, rej),
        };
        return base;
      },
    }),
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };

  return { notificationsTable, alertsTable, state, db };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  notificationsTable: h.notificationsTable,
  alertsTable: h.alertsTable,
}));

// Faux opérateurs drizzle → prédicats exécutables par le fake db ci-dessus.
vi.mock("drizzle-orm", () => ({
  eq: () => () => true,
  and: (...preds: ((r: Row) => boolean)[]) => (r: Row) => preds.every((p) => p(r)),
  lt: (_col: unknown, cutoff: Date) => (r: Row) => r.sentAt.getTime() < cutoff.getTime(),
  isNotNull: () => (r: Row) => r.readAt !== null,
  inArray: (_col: unknown, ids: number[]) => (r: Row) => ids.includes(r.id),
  sql: () => undefined,
}));

vi.mock("../../lib/yahoo", () => ({ getQuotes: vi.fn(), yahooFinance: { chart: vi.fn() } }));
vi.mock("../../lib/emailClient", () => ({
  sendEmail: vi.fn(), alertEmailHtml: vi.fn(), patternAlertEmailHtml: vi.fn(), signalAlertEmailHtml: vi.fn(),
}));
vi.mock("../../lib/signals", () => ({ computeIndicators: vi.fn(), analyzeTradingSignals: vi.fn() }));
vi.mock("../../lib/smsClient", () => ({ sendSms: vi.fn() }));
vi.mock("../../lib/notificationPrefs", () => ({ resolveDestinations: vi.fn() }));
vi.mock("../../lib/patternDetect", () => ({ detectCandlePatterns: vi.fn() }));
vi.mock("../../lib/webPush", () => ({ sendPushToAll: vi.fn() }));
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { purgeOldNotifications } from "../alertWorker";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
let nextId = 1;
const row = (ageDays: number, read: boolean): Row => ({
  id: nextId++,
  sentAt: new Date(now - ageDays * DAY),
  readAt: read ? new Date(now - ageDays * DAY + 1000) : null,
});

beforeEach(() => {
  h.state.rows = [];
  nextId = 1;
});

describe("purgeOldNotifications", () => {
  it("supprime les entrées LUES de plus de 90 jours", async () => {
    const oldRead = row(120, true);
    const recentRead = row(10, true);
    h.state.rows = [oldRead, recentRead];

    await purgeOldNotifications();

    const ids = h.state.rows.map((r) => r.id);
    expect(ids).not.toContain(oldRead.id);
    expect(ids).toContain(recentRead.id);
  });

  it("ne supprime jamais les entrées NON LUES, même très vieilles", async () => {
    const oldUnread = row(365, false);
    h.state.rows = [oldUnread];

    await purgeOldNotifications();

    expect(h.state.rows.map((r) => r.id)).toContain(oldUnread.id);
  });

  it("plafonne la table à 1000 entrées en supprimant les plus anciennes LUES", async () => {
    // 1050 entrées récentes (donc pas touchées par la règle des 90 jours) :
    // 1040 lues + 10 non lues parmi les plus anciennes.
    const rows: Row[] = [];
    for (let i = 0; i < 1050; i++) {
      // âge décroissant : i=0 le plus vieux (50 jours), non-lu pour i<10
      rows.push(row(50 - i * 0.01, i >= 10));
    }
    h.state.rows = rows;

    await purgeOldNotifications();

    expect(h.state.rows.length).toBe(1000);
    // Les 10 non-lues (les plus vieilles) sont toujours là
    for (let i = 0; i < 10; i++) {
      expect(h.state.rows.map((r) => r.id)).toContain(rows[i].id);
    }
  });

  it("ne touche à rien sous les seuils", async () => {
    h.state.rows = [row(10, true), row(20, false), row(89, true)];
    await purgeOldNotifications();
    expect(h.state.rows.length).toBe(3);
  });
});
