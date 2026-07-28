/**
 * Persistance des credentials externes (Twilio, Gmail) en base de données.
 *
 * Même pattern que persistConsumerKeyIfNeeded() pour SnapTrade :
 *   1. Au démarrage, si le secret Replit est présent ET la colonne DB est vide
 *      → on copie la valeur en DB.
 *   2. Les clients (smsClient, emailClient) lisent la DB en priorité, env var
 *      en fallback.
 *   3. Après un remix ou une suppression de secrets, la valeur en DB est toujours là.
 */
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

type CredsRow = {
  id: number;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioFromNumber: string | null;
};

let _cached: CredsRow | null = null;

async function getRow(): Promise<CredsRow | null> {
  if (_cached) return _cached;
  try {
    const [row] = await db.select().from(appSettingsTable).limit(1);
    if (row) _cached = row as unknown as CredsRow;
    return _cached;
  } catch {
    return null;
  }
}

/** Invalide le cache (appelé après une mise à jour). */
export function invalidateCredsCache() {
  _cached = null;
}

/** Persiste tous les credentials externes depuis les env vars vers la DB si absent. */
export async function persistExternalCredsIfNeeded(): Promise<void> {
  const row = await getRow();
  if (!row) return; // table vide — ensureRow() créera la ligne plus tard

  const updates: Partial<typeof appSettingsTable.$inferInsert> = {};

  if (!row.twilioAccountSid && process.env.TWILIO_ACCOUNT_SID) {
    updates.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  }
  if (!row.twilioAuthToken && process.env.TWILIO_AUTH_TOKEN) {
    updates.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  }
  if (!row.twilioFromNumber && process.env.TWILIO_FROM_NUMBER) {
    updates.twilioFromNumber = process.env.TWILIO_FROM_NUMBER;
  }
  if (Object.keys(updates).length === 0) return;

  try {
    await db.update(appSettingsTable).set(updates).where(eq(appSettingsTable.id, row.id));
    _cached = null; // invalide le cache pour relire les nouvelles valeurs
    logger.info(
      { persisted: Object.keys(updates) },
      "credentials externes persistés en base — survivront aux remixes et suppressions de secrets",
    );
  } catch (err) {
    logger.warn({ err }, "impossible de persister les credentials externes en base");
  }
}

/** Résout un credential : DB en priorité, env var en fallback. */
export async function resolveCred(
  dbKey: keyof CredsRow,
  envKey: string,
): Promise<string | null> {
  const row = await getRow();
  const dbVal = row?.[dbKey] as string | null | undefined;
  if (dbVal) return dbVal;
  return process.env[envKey] ?? null;
}
