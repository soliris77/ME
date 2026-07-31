import { Router } from "express";
import { db, watchlistTable, watchlistListsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const DEFAULT_LIST = "Général";

// Fusionne les listes persistées (watchlist_lists, avec ordre) et les listes
// implicites (présentes uniquement via watchlist.list_name).
async function getMergedLists() {
  const [stored, items] = await Promise.all([
    db.select().from(watchlistListsTable).orderBy(watchlistListsTable.position, watchlistListsTable.id),
    db.select({ listName: watchlistTable.listName }).from(watchlistTable),
  ]);
  const names = stored.map((l) => l.name);
  const implicit = new Set(items.map((i) => i.listName || DEFAULT_LIST));
  for (const n of names) implicit.delete(n);
  const extra = Array.from(implicit).sort((a, b) =>
    a === DEFAULT_LIST ? -1 : b === DEFAULT_LIST ? 1 : a.localeCompare(b)
  );
  return [...names, ...extra];
}

// ─── Gestion des listes (avant /watchlist/:id pour éviter le conflit de route) ──

router.get("/watchlist/lists", async (req, res) => {
  try {
    const names = await getMergedLists();
    return res.json(names.map((name, position) => ({ name, position })));
  } catch (err) {
    req.log.error({ err }, "Failed to get watchlist lists");
    return res.status(500).json({ error: "Failed to get watchlist lists" });
  }
});

// Crée une liste vide persistée (bouton « + » de la barre d'onglets).
router.post("/watchlist/lists", async (req, res) => {
  const { name } = req.body as { name?: string };
  const trimmed = name?.trim();
  if (!trimmed) return res.status(400).json({ error: "name is required" });
  try {
    const existing = await getMergedLists();
    if (existing.includes(trimmed)) {
      return res.status(409).json({ error: "List already exists" });
    }
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${watchlistListsTable.position}), -1)` })
      .from(watchlistListsTable);
    const position = Number(max) + 1;
    await db
      .insert(watchlistListsTable)
      .values({ name: trimmed, position })
      .onConflictDoNothing({ target: watchlistListsTable.name });
    return res.status(201).json({ name: trimmed, position });
  } catch (err) {
    req.log.error({ err }, "Failed to create watchlist list");
    return res.status(500).json({ error: "Failed to create watchlist list" });
  }
});

// Persiste l'ordre complet des listes (drag-and-drop des onglets).
router.put("/watchlist/lists/order", async (req, res) => {
  const { names } = req.body as { names?: string[] };
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string" || !n.trim())) {
    return res.status(400).json({ error: "names must be a non-empty string array" });
  }
  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < names.length; i++) {
        const name = names[i].trim();
        await tx
          .insert(watchlistListsTable)
          .values({ name, position: i })
          .onConflictDoUpdate({ target: watchlistListsTable.name, set: { position: i } });
      }
    });
    const merged = await getMergedLists();
    return res.json(merged.map((name, position) => ({ name, position })));
  } catch (err) {
    req.log.error({ err }, "Failed to reorder watchlist lists");
    return res.status(500).json({ error: "Failed to reorder watchlist lists" });
  }
});

// Renomme une liste pour tous les actifs qui la partagent.
router.patch("/watchlist/lists/rename", async (req, res) => {
  const { oldName, newName } = req.body as { oldName?: string; newName?: string };
  if (!oldName?.trim() || !newName?.trim()) {
    return res.status(400).json({ error: "oldName and newName are required" });
  }
  const from = oldName.trim();
  const to = newName.trim();
  if (from === to) return res.json({ name: to });
  try {
    await db.transaction(async (tx) => {
      await tx.update(watchlistTable).set({ listName: to }).where(eq(watchlistTable.listName, from));
      const [existingTarget] = await tx.select().from(watchlistListsTable).where(eq(watchlistListsTable.name, to));
      if (existingTarget) {
        // Fusion : la cible existe déjà, on supprime simplement l'ancienne entrée.
        await tx.delete(watchlistListsTable).where(eq(watchlistListsTable.name, from));
      } else {
        const updated = await tx
          .update(watchlistListsTable)
          .set({ name: to })
          .where(eq(watchlistListsTable.name, from))
          .returning();
        if (updated.length === 0) {
          const [{ max }] = await tx
            .select({ max: sql<number>`coalesce(max(${watchlistListsTable.position}), -1)` })
            .from(watchlistListsTable);
          await tx.insert(watchlistListsTable).values({ name: to, position: Number(max) + 1 });
        }
      }
    });
    return res.json({ name: to });
  } catch (err) {
    req.log.error({ err }, "Failed to rename watchlist list");
    return res.status(500).json({ error: "Failed to rename watchlist list" });
  }
});

// Supprime une liste — uniquement si elle est vide.
router.delete("/watchlist/lists/:name", async (req, res) => {
  const name = decodeURIComponent(req.params.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const items = await db.select({ id: watchlistTable.id }).from(watchlistTable).where(eq(watchlistTable.listName, name));
    if (items.length > 0) {
      return res.status(409).json({ error: "List is not empty" });
    }
    await db.delete(watchlistListsTable).where(eq(watchlistListsTable.name, name));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete watchlist list");
    return res.status(500).json({ error: "Failed to delete watchlist list" });
  }
});

router.get("/watchlist", async (req, res) => {
  try {
    const items = await db.select().from(watchlistTable).orderBy(watchlistTable.addedAt);
    return res.json(
      items.map((i) => ({
        id: i.id,
        symbol: i.symbol,
        name: i.name,
        note: i.note ?? null,
        listName: i.listName,
        addedAt: i.addedAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get watchlist");
    return res.status(500).json({ error: "Failed to get watchlist" });
  }
});

router.post("/watchlist", async (req, res) => {
  const { symbol, name, note, listName } = req.body as { symbol?: string; name?: string; note?: string; listName?: string };
  if (!symbol || !name) {
    return res.status(400).json({ error: "symbol and name are required" });
  }
  try {
    const [item] = await db
      .insert(watchlistTable)
      .values({ symbol: symbol.toUpperCase(), name, note: note ?? null, listName: listName?.trim() || "Général" })
      .returning();
    return res.status(201).json({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      note: item.note ?? null,
      listName: item.listName,
      addedAt: item.addedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to add to watchlist");
    return res.status(500).json({ error: "Failed to add to watchlist" });
  }
});

// Déplace un actif suivi vers une autre liste personnalisée (ou la renomme
// pour tous les actifs qui la partagent, selon le body envoyé).
router.patch("/watchlist/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { listName } = req.body as { listName?: string };
  if (!listName || !listName.trim()) {
    return res.status(400).json({ error: "listName is required" });
  }
  try {
    const [item] = await db
      .update(watchlistTable)
      .set({ listName: listName.trim() })
      .where(eq(watchlistTable.id, id))
      .returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      note: item.note ?? null,
      listName: item.listName,
      addedAt: item.addedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update watchlist item");
    return res.status(500).json({ error: "Failed to update watchlist item" });
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
