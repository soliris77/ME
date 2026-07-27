import { Router } from "express";
import { db, chartNotesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

/** GET /notes?symbol=AAPL — all notes for a symbol */
router.get("/notes", async (req, res) => {
  const symbol = req.query.symbol as string | undefined;
  if (!symbol) return res.status(400).json({ error: "symbol is required" });
  try {
    const rows = await db
      .select()
      .from(chartNotesTable)
      .where(eq(chartNotesTable.symbol, symbol.toUpperCase()))
      .orderBy(chartNotesTable.createdAt);
    return res.json(
      rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        candleDate: r.candleDate,
        text: r.text,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get chart notes");
    return res.status(500).json({ error: "Failed to get chart notes" });
  }
});

/** POST /notes — { symbol, candleDate, text } */
router.post("/notes", async (req, res) => {
  const { symbol, candleDate, text } = req.body as {
    symbol?: string;
    candleDate?: string;
    text?: string;
  };
  if (!symbol || !candleDate || !text?.trim()) {
    return res.status(400).json({ error: "symbol, candleDate, and text are required" });
  }
  try {
    const [row] = await db
      .insert(chartNotesTable)
      .values({ symbol: symbol.toUpperCase(), candleDate, text: text.trim() })
      .returning();
    return res.status(201).json({
      id: row.id,
      symbol: row.symbol,
      candleDate: row.candleDate,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to add chart note");
    return res.status(500).json({ error: "Failed to add chart note" });
  }
});

/** DELETE /notes/:id */
router.delete("/notes/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await db.delete(chartNotesTable).where(eq(chartNotesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete chart note");
    return res.status(500).json({ error: "Failed to delete chart note" });
  }
});

export default router;
