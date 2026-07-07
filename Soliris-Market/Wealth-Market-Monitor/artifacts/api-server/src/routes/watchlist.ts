import { Router } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/watchlist", async (req, res) => {
  try {
    const items = await db.select().from(watchlistTable).orderBy(watchlistTable.addedAt);
    return res.json(
      items.map((i) => ({
        id: i.id,
        symbol: i.symbol,
        name: i.name,
        note: i.note ?? null,
        addedAt: i.addedAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get watchlist");
    return res.status(500).json({ error: "Failed to get watchlist" });
  }
});

router.post("/watchlist", async (req, res) => {
  const { symbol, name, note } = req.body as { symbol?: string; name?: string; note?: string };
  if (!symbol || !name) {
    return res.status(400).json({ error: "symbol and name are required" });
  }
  try {
    const [item] = await db
      .insert(watchlistTable)
      .values({ symbol: symbol.toUpperCase(), name, note: note ?? null })
      .returning();
    return res.status(201).json({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      note: item.note ?? null,
      addedAt: item.addedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to add to watchlist");
    return res.status(500).json({ error: "Failed to add to watchlist" });
  }
});

router.delete("/watchlist/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await db.delete(watchlistTable).where(eq(watchlistTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove from watchlist");
    return res.status(500).json({ error: "Failed to remove from watchlist" });
  }
});

export default router;
