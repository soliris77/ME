import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { desc, isNull, sql } from "drizzle-orm";

const router = Router();

function serialize(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    alertId: n.alertId ?? null,
    symbol: n.symbol,
    name: n.name ?? null,
    alertType: n.alertType,
    title: n.title,
    body: n.body,
    channels: n.channels.split(",").filter(Boolean),
    sentAt: n.sentAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  };
}

// Historique chronologique (plus récent en premier), plafonné à 200 entrées.
router.get("/notifications", async (req, res) => {
  try {
    const items = await db
      .select()
      .from(notificationsTable)
      .orderBy(desc(notificationsTable.sentAt), desc(notificationsTable.id))
      .limit(200);
    return res.json(items.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to get notifications");
    return res.status(500).json({ error: "Failed to get notifications" });
  }
});

// Nombre de notifications non lues — alimente le badge de la sidebar.
router.get("/notifications/unread-count", async (req, res) => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(isNull(notificationsTable.readAt));
    return res.json({ count: row?.count ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to count unread notifications");
    return res.status(500).json({ error: "Failed to count unread notifications" });
  }
});

// Marque tout comme lu — appelé quand l'utilisateur consulte l'historique.
router.post("/notifications/mark-all-read", async (req, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(isNull(notificationsTable.readAt));
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark notifications read");
    return res.status(500).json({ error: "Failed to mark notifications read" });
  }
});

export default router;
