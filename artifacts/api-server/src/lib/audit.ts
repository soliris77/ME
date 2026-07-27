/**
 * Journal d'audit — trace toute action sensible (changement de seuils,
 * kill-switch, connexion/déconnexion courtier). Lecture seule depuis l'UI ;
 * jamais modifié ni purgé par l'application elle-même.
 */
import { db, auditLogTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "./logger";

export async function logAudit(
  action: string,
  summary: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLogTable).values({ action, summary, details: details ?? null });
  } catch (err) {
    // Le journal d'audit ne doit jamais faire échouer l'action qu'il documente.
    logger.error({ err, action }, "audit: failed to write log entry");
  }
}

export async function listAuditLog(limit = 100) {
  return db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit);
}
