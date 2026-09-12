/**
 * Webhook des sources de signaux externes (lot 8).
 *
 * Monté AVANT express.json() dans app.ts, et volontairement : la signature
 * HMAC porte sur les octets exacts du corps. Un JSON analysé puis
 * re-sérialisé ne reproduit pas ces octets — même contenu, signature morte.
 *
 * Ce que fait cette route : vérifier, enregistrer, répondre. Rien d'autre.
 * La confluence est calculée par le worker, qui a déjà le flux de marché sous
 * la main — un webhook qui va chercher des bougies est un webhook qui expire.
 */
import { Router, raw } from "express";
import { pool } from "@workspace/db";
import { parseSignalBody, verifyWebhook } from "@workspace/signals";
import { logger } from "../lib/logger";

export const SIGNATURE_HEADER = "x-soliris-signature";
export const TIMESTAMP_HEADER = "x-soliris-timestamp";

/** Un signal fait quelques centaines d'octets ; au-delà, ce n'est pas un signal. */
const MAX_BODY = "64kb";

/** Marqueur d'attente : le worker reprend les lignes dans cet état. */
export const PENDING_RESULT = "recu";

interface SourceRow {
  id: string;
  kind: string;
  mode: string;
  webhook_secret_env: string | null;
}

const router = Router();

router.post("/:sourceId", raw({ type: "*/*", limit: MAX_BODY }), async (req, res) => {
  const sourceId = String(req.params.sourceId ?? "");

  // Garde-fou de montage : si un express.json() passe avant, req.body est un
  // objet et la signature ne pourra jamais être vérifiée. Mieux vaut le dire
  // franchement qu'accepter des signaux non authentifiés.
  if (!Buffer.isBuffer(req.body)) {
    logger.error({ sourceId }, "webhook signaux : corps brut indisponible, route montée après express.json()");
    return res.status(500).json({ error: "Configuration du serveur incorrecte." });
  }
  const rawBody: Buffer = req.body;

  let source: SourceRow | undefined;
  try {
    const { rows } = await pool.query<SourceRow>(
      `SELECT id, kind, mode, webhook_secret_env FROM signal_sources WHERE id = $1`,
      [sourceId],
    );
    source = rows[0];
  } catch (err) {
    logger.error({ err, sourceId }, "webhook signaux : lecture de la source impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }

  if (!source || source.kind !== "push") {
    return res.status(404).json({ error: "Source inconnue." });
  }
  if (source.mode === "disabled") {
    // Répondre 202 sans rien écrire : la source cesse d'insister, et une
    // source coupée ne laisse aucune trace.
    return res.status(202).json({ accepted: false, reason: "source désactivée" });
  }

  const secret = source.webhook_secret_env ? process.env[source.webhook_secret_env] : undefined;
  if (!secret) {
    logger.error(
      { sourceId, env: source.webhook_secret_env },
      "webhook signaux : secret absent de l'environnement, signal refusé",
    );
    return res.status(401).json({ error: "Signature refusée." });
  }

  const verdict = verifyWebhook({
    rawBody,
    signatureHeader: req.get(SIGNATURE_HEADER),
    timestampHeader: req.get(TIMESTAMP_HEADER),
    secret,
    now: Date.now(),
  });
  if (!verdict.ok) {
    logger.warn({ sourceId, reason: verdict.reason }, "webhook signaux : signature refusée");
    return res.status(401).json({ error: "Signature refusée." });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Corps JSON illisible." });
  }

  const parsed = parseSignalBody(payload);
  if ("error" in parsed) {
    logger.warn({ sourceId, reason: parsed.error }, "webhook signaux : corps refusé");
    return res.status(400).json({ error: parsed.error });
  }

  try {
    // La contrainte UNIQUE (source_id, source_signal_id) est ce qui rend le
    // rejeu inoffensif : une source qui renvoie deux fois n'écrit qu'une ligne.
    const { rowCount } = await pool.query(
      `INSERT INTO external_signals
         (source_id, source_signal_id, symbol, action, emitted_at, reference_price, confluence_result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source_id, source_signal_id) DO NOTHING`,
      [sourceId, parsed.sourceSignalId, parsed.symbol, parsed.action,
       parsed.emittedAt === null ? null : new Date(parsed.emittedAt),
       parsed.referencePrice, PENDING_RESULT],
    );
    const stored = (rowCount ?? 0) > 0;
    logger.info({ sourceId, symbol: parsed.symbol, action: parsed.action, stored },
      stored ? "signal externe reçu" : "signal externe déjà reçu, ignoré");
    return res.status(202).json({ accepted: true, duplicate: !stored });
  } catch (err) {
    logger.error({ err, sourceId }, "webhook signaux : enregistrement impossible");
    return res.status(500).json({ error: "Erreur interne." });
  }
});

export default router;
