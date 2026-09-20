import { pool } from "@workspace/db";
import { VENUE_IDS } from "@workspace/perps";
import { logger } from "../lib/logger";
import { handleCandidate, loadConfig } from "../lib/perpsService";

/**
 * Le worker des perpétuels.
 *
 * Il ne cherche rien de lui-même : il reprend les détections que le scanner
 * a déjà faites (`scanner_hits`) et leur applique la politique. Chaque
 * détection donne au plus une décision, et chaque décision est journalisée,
 * armé ou non.
 *
 * Deux boucles :
 *
 *   1. juger les détections récentes qui n'ont pas encore de décision ;
 *   2. reporter sur ces décisions le rendement réellement constaté par
 *      l'évaluateur d'horizons du scanner.
 *
 * La seconde est ce qui rend la première utile. Sans elle, on accumulerait
 * des intentions sans jamais savoir si elles valaient quelque chose — et
 * `canArm` n'aurait aucun bord mesuré à comparer au coût.
 */

const DEFAULT_INTERVAL_MS = 60_000;
const REALIZED_INTERVAL_MS = 5 * 60_000;

/** L'horizon de référence, en minutes, pour mesurer le bord. */
const REFERENCE_HORIZON_MINUTES = 60;

/** On ne juge que les détections encore fraîches. */
const LOOKBACK_MINUTES = 30;

/** Plafond par cycle, pour ne pas inonder la base après une panne. */
const MAX_PER_CYCLE = 10;

let judgeHandle: ReturnType<typeof setInterval> | null = null;
let realizedHandle: ReturnType<typeof setInterval> | null = null;

interface PendingHit {
  readonly id: string;
  readonly symbol: string;
  readonly priceAtHit: number;
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Le stop vient de l'enveloppe du scanner, pas d'un réglage propre aux
 * perps : c'est le même stop que celui déjà décidé pour les opportunités.
 * Deux stops différents pour la même détection seraient deux stratégies.
 */
async function stopFraction(): Promise<number> {
  const { rows } = await pool.query<{ hard_stop_pct: string }>(
    `SELECT hard_stop_pct FROM opportunity_envelope WHERE id = 1`,
  );
  return toNumber(rows[0]?.hard_stop_pct, 12) / 100;
}

/** Le bord réellement constaté sur l'horizon de référence. */
async function measuredEdge(): Promise<{ edge: number; sample: number }> {
  const { rows } = await pool.query<{ edge: string | null; n: string }>(
    `SELECT avg(return_pct) AS edge, count(*) AS n
       FROM scanner_outcomes
      WHERE horizon_minutes = $1 AND return_pct IS NOT NULL`,
    [REFERENCE_HORIZON_MINUTES],
  );
  const row = rows[0];
  return {
    edge: toNumber(row?.edge, 0) / 100,
    sample: Math.trunc(toNumber(row?.n, 0)),
  };
}

/**
 * Les détections récentes que CETTE plateforme n'a pas encore jugées.
 *
 * Le filtre porte sur la plateforme, pas seulement sur la détection : la même
 * occasion doit être jugée une fois par plateforme, sinon on ne pourrait
 * jamais les comparer sur les mêmes données.
 */
async function pendingHits(venue: string): Promise<PendingHit[]> {
  const { rows } = await pool.query<{
    id: string;
    symbol: string;
    price_at_hit: string;
  }>(
    `SELECT h.id, h.symbol, h.price_at_hit
       FROM scanner_hits h
       LEFT JOIN perps_decisions d
              ON d.scanner_hit_id = h.id AND d.venue = $3
      WHERE d.id IS NULL
        AND h.detected_at > now() - ($1 || ' minutes')::interval
      ORDER BY h.detected_at ASC
      LIMIT $2`,
    [String(LOOKBACK_MINUTES), MAX_PER_CYCLE, venue],
  );
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    priceAtHit: toNumber(r.price_at_hit, 0),
  }));
}

/**
 * Un cycle : juger ce qui est en attente.
 *
 * Le scanner ne détecte que des mouvements haussiers, donc les occasions
 * sont des longs. Le jour où il détectera aussi des ruptures à la baisse,
 * c'est ici que le sens viendra de la détection plutôt que d'être supposé.
 */
export async function runPerpsCycleOnce(): Promise<void> {
  // Chaque plateforme juge pour son propre compte. Une plateforme éteinte ne
  // coûte rien : on lit son réglage et on passe.
  for (const venue of VENUE_IDS) {
    try {
      await runVenueCycle(venue);
    } catch (err) {
      logger.error({ err, venue }, "perps: cycle de plateforme echoue");
    }
  }
}

async function runVenueCycle(venue: string): Promise<void> {
  const config = await loadConfig(venue);
  if (!config.enabled) return;

  const hits = await pendingHits(venue);
  if (hits.length === 0) return;

  const [stop, edge] = await Promise.all([stopFraction(), measuredEdge()]);

  for (const hit of hits) {
    if (hit.priceAtHit <= 0) continue;

    const result = await handleCandidate(
      {
        symbol: hit.symbol,
        side: "long",
        entryPrice: hit.priceAtHit,
        stopPrice: hit.priceAtHit * (1 - stop),
        measuredGrossEdge: edge.edge,
        sampleSize: edge.sample,
      },
      { venueId: venue },
    );

    if (result.decisionId !== null) {
      await pool.query(
        `UPDATE perps_decisions SET scanner_hit_id = $1 WHERE id = $2`,
        [hit.id, result.decisionId],
      );
    }

    logger.info(
      {
        venue,
        symbol: hit.symbol,
        allowed: result.verdict.allowed,
        executed: result.executed,
        refusals: result.verdict.refusals,
      },
      "perps: detection jugee",
    );
  }
}

/**
 * Reporte le rendement constaté sur les décisions déjà prises.
 *
 * Un long gagne ce que la détection a rendu ; un short gagne l'inverse.
 * C'est ce chiffre, moyenné, que `canArm` compare au coût d'un aller-retour.
 */
export async function backfillRealizedEdges(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE perps_decisions d
        SET realized_gross_edge = (o.return_pct / 100)
              * CASE WHEN d.side = 'short' THEN -1 ELSE 1 END,
            realized_at = now()
       FROM scanner_outcomes o
      WHERE o.scanner_hit_id = d.scanner_hit_id
        AND o.horizon_minutes = $1
        AND o.return_pct IS NOT NULL
        AND d.scanner_hit_id IS NOT NULL
        AND d.realized_gross_edge IS NULL`,
    [REFERENCE_HORIZON_MINUTES],
  );
  return rowCount ?? 0;
}

export function startPerpsWorker(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (judgeHandle) return;
  logger.info({ intervalMs }, "Démarrage du worker perps (mode observation)");

  const judge = (): void => {
    void runPerpsCycleOnce().catch((err) =>
      logger.error({ err }, "perps: cycle echoue"),
    );
  };
  const realized = (): void => {
    void backfillRealizedEdges()
      .then((n) => {
        if (n > 0) logger.info({ n }, "perps: rendements reportes");
      })
      .catch((err) => logger.error({ err }, "perps: report des rendements echoue"));
  };

  judge();
  judgeHandle = setInterval(judge, intervalMs);
  realizedHandle = setInterval(realized, REALIZED_INTERVAL_MS);
}

export function stopPerpsWorker(): void {
  if (judgeHandle) {
    clearInterval(judgeHandle);
    judgeHandle = null;
  }
  if (realizedHandle) {
    clearInterval(realizedHandle);
    realizedHandle = null;
  }
}
