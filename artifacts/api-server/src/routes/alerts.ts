import { Router } from "express";
import { db, alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isValidE164 } from "../lib/smsClient";

const router = Router();

function serialize(a: typeof alertsTable.$inferSelect) {
  return {
    id: a.id,
    symbol: a.symbol,
    name: a.name ?? null,
    alertType: a.alertType,
    condition: a.condition ?? null,
    targetPrice: a.targetPrice !== null ? parseFloat(a.targetPrice) : null,
    patternSignal: a.patternSignal ?? null,
    minStrength: a.minStrength ?? null,
    active: a.active,
    notifyEmail: a.notifyEmail ?? null,
    notifyPhone: a.notifyPhone ?? null,
    triggeredAt: a.triggeredAt ? a.triggeredAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/alerts", async (req, res) => {
  try {
    const items = await db.select().from(alertsTable).orderBy(alertsTable.createdAt);
    return res.json(items.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to get alerts");
    return res.status(500).json({ error: "Failed to get alerts" });
  }
});

router.post("/alerts", async (req, res) => {
  const body = req.body as {
    symbol?: string;
    name?: string;
    alertType?: string;
    condition?: string;
    targetPrice?: number;
    patternSignal?: string;
    minStrength?: string;
    notifyEmail?: string;
    notifyPhone?: string;
  };
  const { symbol, name, notifyEmail, notifyPhone } = body;
  const alertType = body.alertType === "pattern" ? "pattern" : body.alertType === "signal" ? "signal" : "price";

  if (!symbol) {
    return res.status(400).json({ error: "symbol is required" });
  }

  if (notifyPhone && !isValidE164(notifyPhone)) {
    return res.status(400).json({ error: "notifyPhone must be in E.164 format, e.g. +15145551234" });
  }

  if (alertType === "price") {
    if (!body.condition || body.targetPrice === undefined) {
      return res.status(400).json({ error: "condition and targetPrice are required for price alerts" });
    }
    if (!["above", "below"].includes(body.condition)) {
      return res.status(400).json({ error: "condition must be above or below" });
    }
  } else if (alertType === "signal") {
    if (body.patternSignal && !["haussier", "baissier"].includes(body.patternSignal)) {
      return res.status(400).json({ error: "patternSignal must be haussier or baissier" });
    }
    if (body.minStrength && !["moyen", "fort"].includes(body.minStrength)) {
      return res.status(400).json({ error: "minStrength must be moyen or fort for signal alerts" });
    }
  } else {
    if (body.patternSignal && !["haussier", "baissier"].includes(body.patternSignal)) {
      return res.status(400).json({ error: "patternSignal must be haussier or baissier" });
    }
    if (body.minStrength && !["faible", "moyen", "fort"].includes(body.minStrength)) {
      return res.status(400).json({ error: "minStrength must be faible, moyen, or fort" });
    }
  }

  try {
    const [alert] = await db
      .insert(alertsTable)
      .values({
        symbol: symbol.toUpperCase(),
        name: name ?? null,
        alertType,
        condition: alertType === "price" ? body.condition! : null,
        targetPrice: alertType === "price" ? String(body.targetPrice) : null,
        patternSignal: (alertType === "pattern" || alertType === "signal") ? body.patternSignal ?? null : null,
        minStrength: (alertType === "pattern" || alertType === "signal") ? body.minStrength ?? null : null,
        active: true,
        notifyEmail: notifyEmail ?? null,
        notifyPhone: notifyPhone ?? null,
      })
      .returning();
    return res.status(201).json(serialize(alert));
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
    return res.json(serialize(alert));
  } catch (err) {
    req.log.error({ err }, "Failed to get triggered alert");
    return res.status(500).json({ error: "Failed to get triggered alert" });
  }
});

export default router;
