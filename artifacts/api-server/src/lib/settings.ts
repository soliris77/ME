/**
 * Paramètres de risque modifiables depuis l'écran /parametres.
 * ─────────────────────────────────────────────────────────────────────────────
 * Une seule ligne en base (mono-utilisateur). Au tout premier accès, la ligne
 * n'existe pas encore : on la crée à partir des variables d'environnement
 * (MAX_ORDER_VALUE, MAX_PORTFOLIO_EXPOSURE) avec une friction par défaut de
 * 50 %, puis on la met en cache en mémoire pour éviter une requête DB sur
 * chaque vérification de risque. Le cache est invalidé à chaque écriture.
 */
import { db, appSettingsTable, type AppSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logAudit } from "./audit";
import { notifySettingsChanged } from "./notifications";

const DEFAULT_MAX_ORDER_VALUE = Number(process.env.MAX_ORDER_VALUE ?? 5000);
const DEFAULT_MAX_PORTFOLIO_EXPOSURE = Number(process.env.MAX_PORTFOLIO_EXPOSURE ?? 25000);
const DEFAULT_FRICTION_PCT = 0.5;

export interface RiskSettings {
  maxOrderValue: number;
  maxPortfolioExposure: number;
  largeOrderFrictionPct: number;
  updatedAt: string;
}

let cache: RiskSettings | null = null;

function toRiskSettings(row: AppSettings): RiskSettings {
  return {
    maxOrderValue: Number(row.maxOrderValue),
    maxPortfolioExposure: Number(row.maxPortfolioExposure),
    largeOrderFrictionPct: Number(row.largeOrderFrictionPct),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureRow(): Promise<AppSettings> {
  const [existing] = await db.select().from(appSettingsTable).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(appSettingsTable)
    .values({
      maxOrderValue: String(DEFAULT_MAX_ORDER_VALUE),
      maxPortfolioExposure: String(DEFAULT_MAX_PORTFOLIO_EXPOSURE),
      largeOrderFrictionPct: String(DEFAULT_FRICTION_PCT),
    })
    .returning();
  return created;
}

export async function getRiskSettings(): Promise<RiskSettings> {
  if (cache) return cache;
  const row = await ensureRow();
  cache = toRiskSettings(row);
  return cache;
}

export interface UpdateRiskSettingsInput {
  maxOrderValue?: number;
  maxPortfolioExposure?: number;
  largeOrderFrictionPct?: number;
}

/** Valide les nouvelles valeurs, les persiste, invalide le cache et journalise le changement. */
export async function updateRiskSettings(patch: UpdateRiskSettingsInput): Promise<RiskSettings> {
  const current = await getRiskSettings();

  const next = {
    maxOrderValue: patch.maxOrderValue ?? current.maxOrderValue,
    maxPortfolioExposure: patch.maxPortfolioExposure ?? current.maxPortfolioExposure,
    largeOrderFrictionPct: patch.largeOrderFrictionPct ?? current.largeOrderFrictionPct,
  };

  if (!Number.isFinite(next.maxOrderValue) || next.maxOrderValue <= 0) {
    throw new Error("La valeur maximale par ordre doit être un nombre positif.");
  }
  if (!Number.isFinite(next.maxPortfolioExposure) || next.maxPortfolioExposure <= 0) {
    throw new Error("L'exposition maximale du portefeuille doit être un nombre positif.");
  }
  if (next.maxOrderValue > next.maxPortfolioExposure) {
    throw new Error("La valeur maximale par ordre ne peut pas dépasser l'exposition maximale du portefeuille.");
  }
  if (!Number.isFinite(next.largeOrderFrictionPct) || next.largeOrderFrictionPct <= 0 || next.largeOrderFrictionPct > 1) {
    throw new Error("Le seuil de confirmation renforcée doit être compris entre 0 et 100 %.");
  }

  const [row] = await db
    .select()
    .from(appSettingsTable)
    .limit(1);

  const [updated] = row
    ? await db
        .update(appSettingsTable)
        .set({
          maxOrderValue: String(next.maxOrderValue),
          maxPortfolioExposure: String(next.maxPortfolioExposure),
          largeOrderFrictionPct: String(next.largeOrderFrictionPct),
          updatedAt: new Date(),
        })
        .where(eq(appSettingsTable.id, row.id))
        .returning()
    : [await ensureRow()];

  cache = toRiskSettings(updated);

  const changes: Record<string, { from: number; to: number }> = {};
  if (patch.maxOrderValue !== undefined && patch.maxOrderValue !== current.maxOrderValue) {
    changes.maxOrderValue = { from: current.maxOrderValue, to: next.maxOrderValue };
  }
  if (patch.maxPortfolioExposure !== undefined && patch.maxPortfolioExposure !== current.maxPortfolioExposure) {
    changes.maxPortfolioExposure = { from: current.maxPortfolioExposure, to: next.maxPortfolioExposure };
  }
  if (patch.largeOrderFrictionPct !== undefined && patch.largeOrderFrictionPct !== current.largeOrderFrictionPct) {
    changes.largeOrderFrictionPct = { from: current.largeOrderFrictionPct, to: next.largeOrderFrictionPct };
  }

  if (Object.keys(changes).length > 0) {
    await logAudit(
      "settings.update",
      "Paramètres de risque modifiés",
      changes,
    );
    await notifySettingsChanged(changes);
  }

  return cache;
}
