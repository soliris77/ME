/**
 * Worker des signaux externes (lot 8).
 *
 * Deux passes, toutes deux bornées pour ne jamais monopoliser un cycle :
 *   1. la confluence — reprendre les signaux reçus, les confronter à notre
 *      propre analyse, et écrire la décision ;
 *   2. les résultats — revenir à 1 h, 4 h et 24 h mesurer ce que le signal
 *      valait vraiment.
 *
 * La mesure est le but. Tant qu'une source est en `shadow`, sa décision est
 * calculée et enregistrée mais ne touche rien : c'est ce qui permet de juger
 * une source sur deux semaines de données plutôt que sur une impression.
 *
 * Ce worker ne passe aucun ordre. Une décision `mayTrade` est journalisée et
 * enregistrée ; l'exécution viendra par le chemin d'entrée habituel, derrière
 * le RiskGate.
 */
import { pool } from "@workspace/db";
import { analyzeSignal, type Candle } from "@workspace/indicators";
import { evaluateConfluence, type ConfluencePolicy, type SignalSource, type SourceMode } from "@workspace/signals";
import { dueHorizons, evaluateHorizon, horizonAbandoned, HORIZONS_MINUTES, type OutcomeCandle } from "@workspace/scanner";
import { logger } from "../lib/logger";
import { toExchangeSymbol, type ScannerExchange } from "./scannerWorker";

const DEFAULT_INTERVAL_MS = 60_000;
const OUTCOME_INTERVAL_MS = 10 * 60 * 1000;
const TIMEFRAME = "15m";
const CANDLES = 200;
const SIGNALS_PER_PASS = 20;
const OUTCOMES_PER_PASS = 20;

interface PendingRow {
  id: string;
  source_id: string;
  symbol: string;
  action: string;
  emitted_at: Date | null;
  received_at: Date;
  reference_price: string | null;
  mode: string;
  confluence_policy: string;
  max_signal_age_seconds: number;
  label: string;
}

/** Marqueur écrit par le webhook ; lu ici. */
const PENDING_RESULT = "recu";

async function fetchCandles(exchange: ScannerExchange, symbol: string, since?: number): Promise<Candle[]> {
  const raw = await exchange.fetchOHLCV(toExchangeSymbol(symbol), TIMEFRAME, since, CANDLES);
  return raw
    .filter((row) => row.length >= 6 && row.every((v) => typeof v === "number" && Number.isFinite(v)))
    .map((row) => ({
      timestamp: row[0], open: row[1], high: row[2], low: row[3], close: row[4], volume: row[5],
    }));
}

/**
 * Passe 1 — confluence. Reprend les signaux en attente et écrit, pour chacun,
 * notre propre lecture du marché et la décision qui en découle.
 */
export async function processPendingSignals(
  exchange: ScannerExchange,
  now: number = Date.now(),
): Promise<{ processed: number; failures: number }> {
  const { rows } = await pool.query<PendingRow>(
    `SELECT e.id, e.source_id, e.symbol, e.action, e.emitted_at, e.received_at, e.reference_price,
            s.mode, s.confluence_policy, s.max_signal_age_seconds, s.label
       FROM external_signals e
       JOIN signal_sources s ON s.id = e.source_id
      WHERE e.confluence_result = $1
      ORDER BY e.received_at
      LIMIT $2`,
    [PENDING_RESULT, SIGNALS_PER_PASS],
  );

  let processed = 0;
  let failures = 0;

  for (const row of rows) {
    try {
      const candles = await fetchCandles(exchange, row.symbol);
      const own = candles.length > 0
        ? analyzeSignal(candles)
        // Sans données, on ne prétend pas avoir un avis : neutre et sans
        // confiance, ce qui ne confirmera jamais un signal externe.
        : { direction: "neutral" as const, confidence: 0 };

      const source: SignalSource = {
        id: row.source_id,
        label: row.label,
        mode: row.mode as SourceMode,
        confluencePolicy: row.confluence_policy as ConfluencePolicy,
        maxSignalAgeSeconds: row.max_signal_age_seconds,
      };

      const decision = evaluateConfluence(
        source,
        {
          sourceSignalId: String(row.id),
          symbol: row.symbol,
          action: row.action,
          emittedAt: row.emitted_at ? new Date(row.emitted_at).getTime() : undefined,
          referencePrice: row.reference_price ? Number(row.reference_price) : undefined,
        },
        { direction: own.direction, confidence: own.confidence },
        now,
      );

      await pool.query(
        `UPDATE external_signals
            SET own_direction = $2, own_confidence = $3, confluence_result = $4, reason = $5
          WHERE id = $1`,
        [row.id, own.direction, own.confidence, decision.result, decision.reason],
      );

      // Une décision qui aurait pu agir mérite d'être visible dans les logs,
      // même quand elle n'agit pas : c'est la donnée qu'on vient chercher.
      if (decision.mayTrade || decision.vetoesOwnEntry || decision.result === "confirme") {
        logger.info(
          { source: row.source_id, symbol: row.symbol, action: row.action,
            resultat: decision.result, applique: decision.applied,
            propre: own.direction, confiance: Number(own.confidence.toFixed(3)) },
          "confluence : décision notable",
        );
      }
      processed++;
    } catch (err) {
      failures++;
      logger.error({ err, signalId: row.id, symbol: row.symbol }, "confluence : signal non traité");
    }
  }

  return { processed, failures };
}

interface OutcomeRow {
  id: string;
  symbol: string;
  received_at: Date;
  reference_price: string | null;
  horizons: number[] | null;
}

/**
 * Passe 2 — résultats. Remplit signal_outcomes pour chaque horizon échu.
 * Réutilise la mécanique d'horizons du scanner : une seule définition de
 * « combien ça valait après une heure » dans tout le dépôt.
 */
export async function evaluateSignalOutcomes(
  exchange: ScannerExchange,
  now: number = Date.now(),
): Promise<{ evaluated: number; abandoned: number }> {
  const maxHorizon = Math.max(...HORIZONS_MINUTES);
  const { rows } = await pool.query<OutcomeRow>(
    `SELECT e.id, e.symbol, e.received_at, e.reference_price,
            array_agg(o.horizon_minutes) FILTER (WHERE o.horizon_minutes IS NOT NULL) AS horizons
       FROM external_signals e
       LEFT JOIN signal_outcomes o ON o.external_signal_id = e.id
      WHERE e.confluence_result <> $1
        AND e.received_at > now() - ($2 || ' minutes')::interval
      GROUP BY e.id
     HAVING count(o.horizon_minutes) < $3
      ORDER BY e.received_at
      LIMIT $4`,
    [PENDING_RESULT, String(maxHorizon + 7 * 24 * 60), HORIZONS_MINUTES.length, OUTCOMES_PER_PASS],
  );

  let evaluated = 0;
  let abandoned = 0;

  for (const row of rows) {
    const signalAt = new Date(row.received_at).getTime();
    const due = dueHorizons(signalAt, now, row.horizons ?? []);
    if (due.length === 0) continue;

    try {
      const candles = await fetchCandles(exchange, row.symbol, signalAt);
      if (candles.length === 0) continue;

      // price_at_signal est NOT NULL : le prix de référence de la source
      // s'il existe, sinon la première clôture après réception.
      const reference = row.reference_price ? Number(row.reference_price) : Number.NaN;
      const priceAtSignal = Number.isFinite(reference) && reference > 0
        ? reference
        : candles[0].close;

      const outcomeCandles: OutcomeCandle[] = candles.map((c) => ({
        timestamp: c.timestamp, high: c.high, low: c.low, close: c.close,
      }));

      for (const horizon of due) {
        const outcome = evaluateHorizon(priceAtSignal, signalAt, horizon, outcomeCandles);

        if (!outcome) {
          if (horizonAbandoned(signalAt, horizon, now)) {
            await pool.query(
              `INSERT INTO signal_outcomes (external_signal_id, horizon_minutes, price_at_signal, evaluated_at)
               VALUES ($1, $2, $3, now())
               ON CONFLICT (external_signal_id, horizon_minutes) DO NOTHING`,
              [row.id, horizon, priceAtSignal],
            );
            abandoned++;
          }
          continue;
        }

        await pool.query(
          `INSERT INTO signal_outcomes
             (external_signal_id, horizon_minutes, price_at_signal, price_at_horizon, return_pct, evaluated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (external_signal_id, horizon_minutes) DO UPDATE SET
             price_at_horizon = EXCLUDED.price_at_horizon,
             return_pct = EXCLUDED.return_pct,
             evaluated_at = EXCLUDED.evaluated_at`,
          [row.id, horizon, priceAtSignal, outcome.priceAtHorizon, outcome.returnPct],
        );
        evaluated++;
      }
    } catch (err) {
      logger.error({ err, signalId: row.id, symbol: row.symbol }, "résultats de signal : horizon non mesuré");
    }
  }

  if (evaluated > 0 || abandoned > 0) {
    logger.info({ evaluated, abandoned }, "signals.outcomes");
  }
  return { evaluated, abandoned };
}

let confluenceHandle: ReturnType<typeof setInterval> | null = null;
let outcomeHandle: ReturnType<typeof setInterval> | null = null;

export function startSignalsWorker(exchange: ScannerExchange, intervalMs = DEFAULT_INTERVAL_MS): void {
  if (confluenceHandle) return;
  logger.info({ intervalMs }, "Démarrage du worker des signaux externes");

  const confluence = () => {
    void processPendingSignals(exchange).catch((err) =>
      logger.error({ err }, "signaux : passe de confluence échouée"));
  };
  const outcomes = () => {
    void evaluateSignalOutcomes(exchange).catch((err) =>
      logger.error({ err }, "signaux : passe de résultats échouée"));
  };

  confluence();
  confluenceHandle = setInterval(confluence, intervalMs);
  outcomeHandle = setInterval(outcomes, OUTCOME_INTERVAL_MS);
}

export function stopSignalsWorker(): void {
  if (confluenceHandle) { clearInterval(confluenceHandle); confluenceHandle = null; }
  if (outcomeHandle) { clearInterval(outcomeHandle); outcomeHandle = null; }
}
