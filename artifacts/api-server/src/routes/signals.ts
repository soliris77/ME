/**
 * /api/signals — pilotage et mesure des sources de signaux externes (lot 8).
 *
 * Protégé par requireAuth (monté dans routes/index.ts). Le webhook d'entrée,
 * lui, est ailleurs (/webhooks/signals) : il s'authentifie par sa signature
 * HMAC, pas par la session.
 *
 * Le secret d'une source ne transite jamais par ici : on expose le NOM de la
 * variable d'environnement, jamais sa valeur.
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { boundedLimit } from "./scanner";

const router = Router();

const MODES = ["shadow", "active", "disabled"] as const;
const POLICIES = ["require_confirmation", "advisory", "veto_only"] as const;

/**
 * Un signal de vente qui précède une baisse a eu raison. Sans cette
 * correction, la mesure noterait la moitié des bonnes décisions comme des
 * pertes. La liste doit rester alignée sur SHORT_WORDS de @workspace/signals.
 */
const DIRECTED_RETURN = `
  CASE WHEN lower(e.action) IN ('sell','short','vente','vendre','entry_short','open_short')
       THEN -o.return_pct ELSE o.return_pct END`;

router.get("/signals/sources", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.label, s.kind, s.mode, s.confluence_policy, s.max_signal_age_seconds,
              s.webhook_secret_env, s.created_at,
              count(e.id)::int AS signaux_recus,
              max(e.received_at) AS dernier_signal
         FROM signal_sources s
         LEFT JOIN external_signals e ON e.source_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at`,
    );
    // secretConfigured dit si la variable existe côté serveur — jamais sa valeur.
    return res.json({
      sources: rows.map((row: Record<string, unknown>) => ({
        ...row,
        secretConfigured: typeof row.webhook_secret_env === "string"
          && Boolean(process.env[row.webhook_secret_env as string]),
      })),
    });
  } catch (err) {
    logger.error({ err }, "signaux : lecture des sources impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

router.post("/signals/sources", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";

  if (!/^[a-z0-9][a-z0-9_-]{1,60}$/.test(id)) {
    return res.status(400).json({ error: "id invalide (minuscules, chiffres, - et _)" });
  }
  if (!label) return res.status(400).json({ error: "label manquant" });

  const kind = body.kind === "pull" ? "pull" : "push";
  const policy = typeof body.confluencePolicy === "string" ? body.confluencePolicy : "require_confirmation";
  if (!POLICIES.includes(policy as (typeof POLICIES)[number])) {
    return res.status(400).json({ error: `confluencePolicy doit être ${POLICIES.join(", ")}` });
  }
  const maxAge = Number(body.maxSignalAgeSeconds ?? 60);
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 86_400) {
    return res.status(400).json({ error: "maxSignalAgeSeconds doit être un entier entre 1 et 86400" });
  }
  const secretEnv = typeof body.webhookSecretEnv === "string" ? body.webhookSecretEnv.trim() : null;
  if (kind === "push" && !secretEnv) {
    // Sans secret, le webhook refusera tout : autant le dire à la création.
    return res.status(400).json({ error: "webhookSecretEnv est requis pour une source push" });
  }

  try {
    // Une source naît toujours en observation : elle doit faire ses preuves
    // avant qu'on lui donne le moindre pouvoir.
    const { rows } = await pool.query(
      `INSERT INTO signal_sources (id, label, kind, mode, confluence_policy, max_signal_age_seconds, webhook_secret_env)
       VALUES ($1, $2, $3, 'shadow', $4, $5, $6)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [id, label, kind, policy, maxAge, secretEnv],
    );
    if (rows.length === 0) return res.status(409).json({ error: "Une source porte déjà cet identifiant." });
    logger.warn({ sourceId: id, kind, policy }, "signaux : source créée");
    return res.status(201).json({ source: rows[0] });
  } catch (err) {
    logger.error({ err }, "signaux : création de source impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

router.put("/signals/sources/:id", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sourceId = String(req.params.id ?? "");
  const sets: string[] = [];
  const values: unknown[] = [];

  if ("mode" in body) {
    const mode = body.mode;
    if (typeof mode !== "string" || !MODES.includes(mode as (typeof MODES)[number])) {
      return res.status(400).json({ error: `mode doit être ${MODES.join(", ")}` });
    }
    // `active` est ce qui donne à une source le droit d'influencer une entrée.
    if (mode === "active" && body.confirm !== true) {
      return res.status(400).json({
        error: "Activer une source exige confirm: true.",
        mesure: await sourceMeasurement(sourceId),
      });
    }
    values.push(mode);
    sets.push(`mode = $${values.length}`);
  }

  if ("confluencePolicy" in body) {
    const policy = body.confluencePolicy;
    if (typeof policy !== "string" || !POLICIES.includes(policy as (typeof POLICIES)[number])) {
      return res.status(400).json({ error: `confluencePolicy doit être ${POLICIES.join(", ")}` });
    }
    values.push(policy);
    sets.push(`confluence_policy = $${values.length}`);
  }

  if ("maxSignalAgeSeconds" in body) {
    const maxAge = Number(body.maxSignalAgeSeconds);
    if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 86_400) {
      return res.status(400).json({ error: "maxSignalAgeSeconds doit être un entier entre 1 et 86400" });
    }
    values.push(maxAge);
    sets.push(`max_signal_age_seconds = $${values.length}`);
  }

  if (sets.length === 0) return res.status(400).json({ error: "Aucun réglage reconnu dans la requête." });

  try {
    values.push(sourceId);
    const { rows } = await pool.query(
      `UPDATE signal_sources SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: "Source inconnue." });
    logger.warn({ sourceId, champs: sets }, "signaux : source modifiée");
    return res.json({ source: rows[0] });
  } catch (err) {
    logger.error({ err, sourceId }, "signaux : écriture de la source impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

async function sourceMeasurement(sourceId: string): Promise<unknown> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS mesures,
            round(avg(${DIRECTED_RETURN}), 3) AS rendement_dirige_moyen
       FROM signal_outcomes o
       JOIN external_signals e ON e.id = o.external_signal_id
      WHERE e.source_id = $1 AND o.return_pct IS NOT NULL`,
    [sourceId],
  );
  return rows[0] ?? null;
}

router.get("/signals/recent", async (req, res) => {
  const limit = boundedLimit(req.query.limit, 50, 500);
  try {
    const { rows } = await pool.query(
      `SELECT e.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'horizonMinutes', o.horizon_minutes,
                    'returnPct', o.return_pct,
                    'directedReturnPct', ${DIRECTED_RETURN}
                  ) ORDER BY o.horizon_minutes
                ) FILTER (WHERE o.horizon_minutes IS NOT NULL),
                '[]'
              ) AS outcomes
         FROM external_signals e
         LEFT JOIN signal_outcomes o ON o.external_signal_id = e.id
        GROUP BY e.id
        ORDER BY e.received_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ signals: rows });
  } catch (err) {
    logger.error({ err }, "signaux : lecture des signaux impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

/**
 * Ce que chaque source vaut réellement, par horizon, en tenant compte du sens
 * du signal. Plus la répartition des décisions de confluence, qui dit si une
 * source apporte quelque chose ou ne fait que répéter notre propre analyse.
 */
router.get("/signals/performance", async (_req, res) => {
  try {
    const { rows: parSource } = await pool.query(
      `SELECT e.source_id,
              o.horizon_minutes,
              count(*)::int AS n,
              round(avg(${DIRECTED_RETURN}), 3) AS rendement_dirige_moyen,
              count(*) FILTER (WHERE ${DIRECTED_RETURN} > 0)::int AS gagnants
         FROM signal_outcomes o
         JOIN external_signals e ON e.id = o.external_signal_id
        WHERE o.return_pct IS NOT NULL
        GROUP BY e.source_id, o.horizon_minutes
        ORDER BY e.source_id, o.horizon_minutes`,
    );

    const { rows: parDecision } = await pool.query(
      `SELECT source_id, confluence_result, count(*)::int AS n
         FROM external_signals
        GROUP BY source_id, confluence_result
        ORDER BY source_id, n DESC`,
    );

    return res.json({ parSource, parDecision });
  } catch (err) {
    logger.error({ err }, "signaux : lecture de la performance impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

export default router;
