/**
 * /api/audit — journal d'audit en lecture seule. Protégé par requireAuth
 * (monté dans routes/index.ts). Aucune route de suppression : c'est un
 * journal d'événements, pas un état modifiable depuis l'UI.
 */
import { Router } from "express";
import { listAuditLog } from "../lib/audit";

const router = Router();

router.get("/audit", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  const entries = await listAuditLog(limit);
  return res.json(entries);
});

export default router;
