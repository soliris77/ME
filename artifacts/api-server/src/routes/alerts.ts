import { Router } from "express";
import { db, alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/alerts", async (req, res) => {
  try {
    const items = await db.select().from(alertsTable).orderBy(alertsTable.createdAt);
    return res.json(
      items.map((a) => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name ?? null,
        condition: a.condition,
        targetPrice: parseFloat(a.targetPrice),
        active: a.active,
        triggeredAt: a.triggeredAt ? a.triggeredAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get alerts");
    return res.status(500).json({ error: "Failed to get alerts" });
  }
});

router.post("/alerts", async (req, res) => {
  const { symbol, name, condition, targetPrice } = req.body as {
    symbol?: string;
    name?: string;
    condition?: string;
    targetPrice?: number;
  };
  if (!symbol || !condition || targetPrice === undefined) {
    return res.status(400).json({ error: "symbol, condition, and targetPrice are required" });
  }
  if (!["above", "below"].includes(condition)) {
    return res.status(400).json({ error: "condition must be above or below" });
  }
  try {
    const [alert] = await db
      .insert(alertsTable)
      .values({
        symbol: symbol.toUpperCase(),
        name: name ?? null,
        condition,
        targetPrice: String(targetPrice),
        active: true,
      })
      .returning();
    return res.status(201).json({
      id: alert.id,
      symbol: alert.symbol,
      name: alert.name ?? null,
      condition: alert.condition,
      targetPrice: parseFloat(alert.targetPrice),
      active: alert.active,
      triggeredAt: null,
      createdAt: alert.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create alert");
    return res.status(500).json({ error: "Failed to create alert" });
  }
});

router.delete("/alerts/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await db.delete(alertsTable).where(eq(alertsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete alert");
    return res.status(500).json({ error: "Failed to delete alert" });
  }
});

router.get("/alerts/:id/triggered", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [alert] = await db.select().from(alertsTable).where(eq(alertsTable.id, id));
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    return res.json({
      id: alert.id,
      symbol: alert.symbol,
      name: alert.name ?? null,
      condition: alert.condition,
      targetPrice: parseFloat(alert.targetPrice),
      active: alert.active,
      triggeredAt: alert.triggeredAt ? alert.triggeredAt.toISOString() : null,
      createdAt: alert.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get triggered alert");
    return res.status(500).json({ error: "Failed to get triggered alert" });
  }
});

export default router;
