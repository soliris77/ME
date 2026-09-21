/**
 * /api/scanner — pilotage et mesure du scanner d'opportunités (lot 9).
 *
 * Protégé par requireAuth (monté dans routes/index.ts).
 *
 * Deux choses vivent ici :
 *   1. l'interrupteur — activer, désactiver, régler les seuils ;
 *   2. la mesure — ce que les détections ont réellement donné à 1 h, 4 h
 *      et 24 h. C'est cette seconde partie qui doit décider de la première.
 *
 * Passer le scanner en `armed` est le seul geste de ce fichier qui puisse un
 * jour mener à un ordre. Il exige donc une confirmation explicite, et la
 * réponse rappelle combien de détections ont été mesurées jusqu'ici.
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { listHyperliquidMarkets } from "../lib/hyperliquidMarketData";

const router = Router();

const MODES = ["shadow", "armed", "disabled"] as const;
type ScannerMode = (typeof MODES)[number];

/** Champs modifiables, avec leurs bornes. Rien d'autre n'est accepté. */
const SETTING_FIELDS: Record<string, { column: string; min: number; max: number; integer?: boolean }> = {
  minQuoteVolume24h:    { column: "min_quote_volume_24h", min: 0, max: 1_000_000_000 },
  maxSpreadPct:         { column: "max_spread_pct", min: 0, max: 100 },
  alertScoreThreshold:  { column: "alert_score_threshold", min: 0, max: 100, integer: true },
  recordScoreThreshold: { column: "record_score_threshold", min: 0, max: 100, integer: true },
  alertCooldownMinutes: { column: "alert_cooldown_minutes", min: 0, max: 1440, integer: true },
  maxAlertsPerHour:     { column: "max_alerts_per_hour", min: 0, max: 100, integer: true },
  maxSymbolsPerCycle:   { column: "max_symbols_per_cycle", min: 1, max: 500, integer: true },
  scanIntervalMinutes:  { column: "scan_interval_minutes", min: 1, max: 1440, integer: true },
};

const ENVELOPE_FIELDS: Record<string, { column: string; min: number; max: number; integer?: boolean }> = {
  totalAmount:      { column: "total_amount", min: 0, max: 10_000_000 },
  perTradeAmount:   { column: "per_trade_amount", min: 0, max: 10_000_000 },
  maxConcurrent:    { column: "max_concurrent", min: 0, max: 50, integer: true },
  dailyLossCapPct:  { column: "daily_loss_cap_pct", min: 0, max: 100 },
  trailingStopPct:  { column: "trailing_stop_pct", min: 0, max: 100 },
  hardStopPct:      { column: "hard_stop_pct", min: 0, max: 100 },
};

router.get("/scanner/markets", async (_req, res) => {
  try {
    const markets = await listHyperliquidMarkets();
    return res.json({
      venue: "hyperliquid",
      source: "public_markets_and_tickers",
      refreshedAt: new Date().toISOString(),
      markets,
    });
  } catch (err) {
    logger.error({ err }, "scanner: lecture des marchés Hyperliquid impossible");
    return res.status(502).json({ error: "Impossible de lire les marchés publics Hyperliquid." });
  }
});

interface Assignment { fragment: string; value: unknown }

/**
 * Construit la liste des colonnes à écrire. Retourne une erreur au premier
 * champ hors bornes plutôt que d'écrire une moitié de réglages.
 */
function buildAssignments(
  body: Record<string, unknown>,
  fields: typeof SETTING_FIELDS,
): { assignments: Assignment[] } | { error: string } {
  const assignments: Assignment[] = [];
  for (const [key, spec] of Object.entries(fields)) {
    if (!(key in body)) continue;
    const raw = body[key];
    const value = Number(raw);
    if (!Number.isFinite(value)) return { error: `${key} doit être un nombre` };
    if (spec.integer && !Number.isInteger(value)) return { error: `${key} doit être un entier` };
    if (value < spec.min || value > spec.max) {
      return { error: `${key} doit être entre ${spec.min} et ${spec.max}` };
    }
    assignments.push({ fragment: spec.column, value });
  }
  return { assignments };
}

/** Nombre d'horizons déjà mesurés — l'argument chiffré pour ou contre l'armement. */
async function measuredOutcomes(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) AS count FROM scanner_outcomes WHERE return_pct IS NOT NULL`,
  );
  return Number(rows[0]?.count ?? 0);
}

router.get("/scanner/settings", async (_req, res) => {
  try {
    const settings = await pool.query(`SELECT * FROM scanner_settings WHERE id = 1`);
    const envelope = await pool.query(`SELECT * FROM opportunity_envelope WHERE id = 1`);
    return res.json({
      settings: settings.rows[0] ?? null,
      envelope: envelope.rows[0] ?? null,
      measuredOutcomes: await measuredOutcomes(),
    });
  } catch (err) {
    logger.error({ err }, "scanner: lecture des réglages impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

router.put("/scanner/settings", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const built = buildAssignments(body, SETTING_FIELDS);
  if ("error" in built) return res.status(400).json({ error: built.error });
  const assignments = built.assignments;

  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return res.status(400).json({ error: "enabled doit être un booléen" });
    }
    assignments.push({ fragment: "enabled", value: body.enabled });
  }

  if ("mode" in body) {
    const mode = body.mode;
    if (typeof mode !== "string" || !MODES.includes(mode as ScannerMode)) {
      return res.status(400).json({ error: `mode doit être ${MODES.join(", ")}` });
    }
    // `armed` est le seul réglage d'ici qui puisse mener à un ordre réel.
    // On exige que l'appelant le dise explicitement : un clic de trop dans une
    // interface ne doit pas suffire.
    if (mode === "armed" && body.confirm !== true) {
      return res.status(400).json({
        error: "Passer le scanner en mode armé exige confirm: true.",
        measuredOutcomes: await measuredOutcomes(),
      });
    }
    assignments.push({ fragment: "mode", value: mode });
  }

  if ("excludedSymbols" in body) {
    const list = body.excludedSymbols;
    if (!Array.isArray(list) || list.some((s) => typeof s !== "string")) {
      return res.status(400).json({ error: "excludedSymbols doit être une liste de chaînes" });
    }
    assignments.push({ fragment: "excluded_symbols", value: list.map((s) => String(s).toUpperCase()) });
  }

  if (assignments.length === 0) {
    return res.status(400).json({ error: "Aucun réglage reconnu dans la requête." });
  }

  try {
    const sets = assignments.map((a, i) => `${a.fragment} = $${i + 1}`);
    const { rows } = await pool.query(
      `UPDATE scanner_settings SET ${sets.join(", ")}, updated_at = now() WHERE id = 1 RETURNING *`,
      assignments.map((a) => a.value),
    );
    logger.warn({ champs: assignments.map((a) => a.fragment) }, "scanner: réglages modifiés");
    return res.json({ settings: rows[0] ?? null, measuredOutcomes: await measuredOutcomes() });
  } catch (err) {
    logger.error({ err }, "scanner: écriture des réglages impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

router.put("/scanner/envelope", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const built = buildAssignments(body, ENVELOPE_FIELDS);
  if ("error" in built) return res.status(400).json({ error: built.error });
  if (built.assignments.length === 0) {
    return res.status(400).json({ error: "Aucun réglage reconnu dans la requête." });
  }

  // Une enveloppe dont la mise par trade dépasse le total n'est pas une
  // enveloppe : on refuse plutôt que d'écrire une contradiction.
  const total = pick(body, "totalAmount");
  const perTrade = pick(body, "perTradeAmount");
  if (total !== null && perTrade !== null && perTrade > total) {
    return res.status(400).json({ error: "perTradeAmount ne peut pas dépasser totalAmount" });
  }

  try {
    const sets = built.assignments.map((a, i) => `${a.fragment} = $${i + 1}`);
    const { rows } = await pool.query(
      `UPDATE opportunity_envelope SET ${sets.join(", ")}, updated_at = now() WHERE id = 1 RETURNING *`,
      built.assignments.map((a) => a.value),
    );
    logger.warn({ champs: built.assignments.map((a) => a.fragment) }, "scanner: enveloppe modifiée");
    return res.json({ envelope: rows[0] ?? null });
  } catch (err) {
    logger.error({ err }, "scanner: écriture de l'enveloppe impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

function pick(body: Record<string, unknown>, key: string): number | null {
  if (!(key in body)) return null;
  const value = Number(body[key]);
  return Number.isFinite(value) ? value : null;
}

router.get("/scanner/hits", async (req, res) => {
  const limit = boundedLimit(req.query.limit, 50, 500);
  try {
    const { rows } = await pool.query(
      `SELECT h.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'horizonMinutes', o.horizon_minutes,
                    'returnPct', o.return_pct,
                    'maxFavorablePct', o.max_favorable_pct,
                    'maxAdversePct', o.max_adverse_pct
                  ) ORDER BY o.horizon_minutes
                ) FILTER (WHERE o.horizon_minutes IS NOT NULL),
                '[]'
              ) AS outcomes
         FROM scanner_hits h
         LEFT JOIN scanner_outcomes o ON o.scanner_hit_id = h.id
        GROUP BY h.id
        ORDER BY h.detected_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ hits: rows });
  } catch (err) {
    logger.error({ err }, "scanner: lecture des détections impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

/**
 * Le tableau de bord de la décision : par tranche de score et par horizon,
 * ce que les détections ont donné. `maxAdverse` compte autant que le
 * rendement — une tranche rentable en moyenne mais qui passe par -25 % n'est
 * pas une tranche qu'on veut armer.
 */
router.get("/scanner/performance", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT CASE
                WHEN h.score >= 80 THEN '80-100'
                WHEN h.score >= 60 THEN '60-79'
                ELSE '40-59'
              END AS tranche,
              o.horizon_minutes,
              count(*)::int AS n,
              round(avg(o.return_pct), 3) AS rendement_moyen,
              round(avg(o.max_favorable_pct), 3) AS meilleur_point_moyen,
              round(avg(o.max_adverse_pct), 3) AS pire_point_moyen,
              count(*) FILTER (WHERE o.return_pct > 0)::int AS gagnants
         FROM scanner_outcomes o
         JOIN scanner_hits h ON h.id = o.scanner_hit_id
        WHERE o.return_pct IS NOT NULL
        GROUP BY tranche, o.horizon_minutes
        ORDER BY tranche DESC, o.horizon_minutes`,
    );

    const { rows: totals } = await pool.query(
      `SELECT count(*)::int AS detections,
              count(*) FILTER (WHERE outcome = 'alerted')::int AS alertees,
              min(detected_at) AS depuis
         FROM scanner_hits`,
    );

    return res.json({ parTranche: rows, total: totals[0] ?? null });
  } catch (err) {
    logger.error({ err }, "scanner: lecture de la performance impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

export function boundedLimit(raw: unknown, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

export default router;
