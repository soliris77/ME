/**
 * Worker du scanner d'opportunités (lot 9).
 *
 * Ce fichier est la seule couche qui parle à la base et à la bourse. Toute la
 * logique — univers, score, alertes, horizons — vit dans @workspace/scanner et
 * est testée sans réseau. Ici : du SQL, du ccxt, et rien d'autre.
 *
 * Deux boucles indépendantes :
 *   1. le scan, qui détecte et alerte ;
 *   2. l'évaluateur d'horizons, qui revient mesurer ce que la détection valait
 *      vraiment à 1 h, 4 h et 24 h. C'est cette seconde boucle qui permettra
 *      de décider, chiffres en main, si le scanner mérite un jour d'être armé.
 *
 * Le scanner ne passe jamais d'ordre. Le mode 'armed' n'est pas lu ici : il
 * sera lu par le chemin d'entrée en position, derrière le RiskGate et
 * l'enveloppe d'opportunité.
 */
import { pool } from "@workspace/db";
import { atr, type Candle } from "@workspace/indicators";
import {
  runScanCycle,
  dueHorizons,
  evaluateHorizon,
  horizonAbandoned,
  HORIZONS_MINUTES,
  type ScanCyclePorts,
  type ScanSettings,
  type ScannerHit,
  type ScanCandidate,
  type ScannerMode,
  type ScoreCandle,
  type OutcomeCandle,
  type AlertState,
} from "@workspace/scanner";
import { sendEmail } from "../lib/emailClient";
import { resolveDestinations } from "../lib/notificationPrefs";
import { logger } from "../lib/logger";

/** Sous-ensemble de ccxt réellement utilisé — évite de dépendre du type global. */
export interface ScannerExchange {
  fetchTickers(symbols?: string[]): Promise<Record<string, {
    symbol?: string;
    last?: number;
    close?: number;
    bid?: number;
    ask?: number;
    quoteVolume?: number;
  }>>;
  fetchOHLCV(
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
  ): Promise<number[][]>;
}

const DEFAULT_SCAN_INTERVAL_MS = 15 * 60 * 1000;
const OUTCOME_INTERVAL_MS = 10 * 60 * 1000;
const CANDLES_PER_SCAN = 200;   // > MIN_CANDLES (120) avec de la marge
const ATR_PERIOD = 14;
const OUTCOMES_PER_PASS = 20;   // borne le travail d'un passage

// ── Conversion de symboles ───────────────────────────────────────────────
// Interne : 'SOL-USD'. ccxt : 'SOL/USD'. Une seule paire de fonctions, ici.

export function toExchangeSymbol(symbol: string): string {
  return symbol.replace("-", "/");
}

export function toInternalSymbol(symbol: string): string {
  return symbol.replace("/", "-");
}

// ── Réglages ─────────────────────────────────────────────────────────────

interface SettingsRow {
  enabled: boolean;
  quote_currency: string;
  min_quote_volume_24h: string;
  max_spread_pct: string;
  alert_score_threshold: number;
  record_score_threshold: number;
  alert_cooldown_minutes: number;
  max_alerts_per_hour: number;
  max_symbols_per_cycle: number;
  scan_interval_minutes: number;
  excluded_symbols: string[] | null;
  timeframe: string;
  mode: string;
}

export async function loadScannerSettings(): Promise<{ settings: ScanSettings; timeframe: string; intervalMs: number } | null> {
  const { rows } = await pool.query<SettingsRow>(
    `SELECT enabled, quote_currency, min_quote_volume_24h, max_spread_pct,
            alert_score_threshold, record_score_threshold, alert_cooldown_minutes,
            max_alerts_per_hour, max_symbols_per_cycle, scan_interval_minutes,
            excluded_symbols, timeframe, mode
       FROM scanner_settings WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) return null;

  const settings: ScanSettings = {
    enabled: row.enabled,
    mode: row.mode as ScannerMode,
    universe: {
      quoteCurrency: row.quote_currency,
      minQuoteVolume24h: Number(row.min_quote_volume_24h),
      maxSpreadPct: Number(row.max_spread_pct),
      excludedSymbols: row.excluded_symbols ?? [],
    },
    alert: {
      scoreThreshold: row.alert_score_threshold,
      cooldownMinutes: row.alert_cooldown_minutes,
      maxAlertsPerHour: row.max_alerts_per_hour,
    },
    recordScoreThreshold: row.record_score_threshold,
    maxSymbolsPerCycle: row.max_symbols_per_cycle,
  };

  return {
    settings,
    timeframe: row.timeframe,
    intervalMs: Math.max(1, row.scan_interval_minutes) * 60_000,
  };
}

// ── Ports ────────────────────────────────────────────────────────────────

function buildPorts(exchange: ScannerExchange, timeframe: string): ScanCyclePorts {
  return {
    async listCandidates(): Promise<ScanCandidate[]> {
      const tickers = await exchange.fetchTickers();
      const candidates: ScanCandidate[] = [];

      for (const [key, ticker] of Object.entries(tickers)) {
        const raw = ticker.symbol ?? key;
        const last = ticker.last ?? ticker.close;
        if (typeof last !== "number" || !Number.isFinite(last) || last <= 0) continue;

        // Sans carnet exploitable, on ne peut pas juger la tradabilité :
        // on met un écart volontairement rédhibitoire plutôt que zéro.
        const bid = ticker.bid;
        const ask = ticker.ask;
        const spreadPct =
          typeof bid === "number" && typeof ask === "number" && bid > 0 && ask > 0
            ? ((ask - bid) / ((ask + bid) / 2)) * 100
            : Number.POSITIVE_INFINITY;

        candidates.push({
          symbol: toInternalSymbol(raw),
          lastPrice: last,
          quoteVolume24h: Number(ticker.quoteVolume ?? 0),
          spreadPct,
        });
      }

      return candidates;
    },

    async loadSeries(symbol: string) {
      const raw = await exchange.fetchOHLCV(toExchangeSymbol(symbol), timeframe, undefined, CANDLES_PER_SCAN);
      const candles: Candle[] = raw
        .filter((row) => row.length >= 6 && row.every((v) => typeof v === "number" && Number.isFinite(v)))
        .map((row) => ({
          timestamp: row[0], open: row[1], high: row[2], low: row[3], close: row[4], volume: row[5],
        }));
      if (candles.length === 0) return null;

      // L'ATR vient de @workspace/indicators — le scanner n'en a pas de copie.
      const series = atr(candles, ATR_PERIOD);
      const atrValue = series[series.length - 1];
      if (atrValue === undefined) return null;

      const scoreCandles: ScoreCandle[] = candles.map((c) => ({ close: c.close, volume: c.volume }));
      return { candles: scoreCandles, atr: atrValue };
    },

    async loadAlertState(): Promise<AlertState> {
      const { rows } = await pool.query<{ symbol: string; last_alert: Date }>(
        `SELECT symbol, MAX(detected_at) AS last_alert
           FROM scanner_hits
          WHERE outcome = 'alerted' AND detected_at > now() - interval '24 hours'
          GROUP BY symbol`,
      );
      const { rows: counted } = await pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM scanner_hits
          WHERE outcome = 'alerted' AND detected_at > now() - interval '1 hour'`,
      );
      return {
        lastAlertBySymbol: new Map(rows.map((r) => [r.symbol, new Date(r.last_alert).getTime()])),
        alertsSentLastHour: Number(counted[0]?.count ?? 0),
      };
    },

    async recordHit(hit: ScannerHit): Promise<number> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO scanner_hits
           (symbol, detected_at, score, roc_pct, volume_ratio, atr_multiple, extension_atr,
            quote_volume_24h, spread_pct, price_at_hit, reasons, outcome)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'observed')
         ON CONFLICT (symbol, detected_at) DO UPDATE SET score = EXCLUDED.score
         RETURNING id`,
        [
          hit.symbol,
          new Date(hit.detectedAt),
          hit.score,
          hit.rocPct,
          hit.volumeRatio,
          hit.atrMultiple,
          hit.extensionAtr,
          hit.quoteVolume24h,
          // Colonne NUMERIC(6,3) : un écart infini (carnet absent) ne doit pas
          // faire échouer l'insertion.
          Number.isFinite(hit.spreadPct) ? hit.spreadPct : 999.999,
          hit.priceAtHit,
          hit.reasons,
        ],
      );
      return Number(rows[0].id);
    },

    async markAlerted(hitId: number): Promise<void> {
      await pool.query(`UPDATE scanner_hits SET outcome = 'alerted' WHERE id = $1`, [hitId]);
    },

    async sendAlert(hits: readonly ScannerHit[]): Promise<void> {
      const dest = await resolveDestinations("signalAlert");
      if (!dest.sendEmail || !dest.email) {
        logger.warn({ count: hits.length }, "scanner: détections à signaler mais aucun canal courriel configuré");
        return;
      }
      await sendEmail({
        to: dest.email,
        subject: hits.length === 1
          ? `🛰️ Scanner — ${hits[0].symbol} démarre (score ${hits[0].score})`
          : `🛰️ Scanner — ${hits.length} paires démarrent`,
        html: scannerAlertHtml(hits),
      });
    },

    now: () => Date.now(),

    log(event, data) {
      logger.info(data, event);
    },
  };
}

/**
 * Courriel d'alerte. Volontairement factuel : le score, ce qui l'a déclenché,
 * et la mention explicite quand la paire est déjà trop étendue pour entrer.
 */
export function scannerAlertHtml(hits: readonly ScannerHit[]): string {
  const rows = hits
    .map((h) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600">${escapeHtml(h.symbol)}</td>
        <td style="padding:8px 12px;text-align:right">${h.score}</td>
        <td style="padding:8px 12px;text-align:right">${h.rocPct.toFixed(2)} %</td>
        <td style="padding:8px 12px;text-align:right">${h.volumeRatio.toFixed(1)}×</td>
        <td style="padding:8px 12px">${escapeHtml(h.reasons.join(", "))}</td>
      </tr>`)
    .join("");

  const extended = hits.filter((h) => h.tooExtended).map((h) => h.symbol);
  const warning = extended.length > 0
    ? `<p style="color:#b45309">Déjà étendues, à ne pas poursuivre : ${escapeHtml(extended.join(", "))}.</p>`
    : "";

  return `
    <div style="font-family:system-ui,sans-serif;color:#111">
      <h2 style="margin:0 0 4px">Scanner d'opportunités</h2>
      <p style="margin:0 0 16px;color:#555">Détection en mode observation. Aucun ordre n'a été passé.</p>
      <table style="border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f3f4f6;text-align:left">
            <th style="padding:8px 12px">Paire</th>
            <th style="padding:8px 12px">Score</th>
            <th style="padding:8px 12px">1 h</th>
            <th style="padding:8px 12px">Volume</th>
            <th style="padding:8px 12px">Motifs</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${warning}
    </div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

// ── Évaluateur d'horizons ────────────────────────────────────────────────

interface PendingHit {
  id: string;
  symbol: string;
  detected_at: Date;
  price_at_hit: string;
  horizons: number[] | null;
}

/**
 * Remplit scanner_outcomes pour les détections dont un horizon est échu.
 * Chaque détection est mesurée sur ce qu'elle a réellement fait entre-temps :
 * meilleur point, pire point, clôture.
 */
export async function evaluateScannerOutcomes(
  exchange: ScannerExchange,
  timeframe: string,
  now: number = Date.now(),
): Promise<{ evaluated: number; abandoned: number; pending: number }> {
  const maxHorizon = Math.max(...HORIZONS_MINUTES);
  const { rows } = await pool.query<PendingHit>(
    `SELECT h.id, h.symbol, h.detected_at, h.price_at_hit,
            array_agg(o.horizon_minutes) FILTER (WHERE o.horizon_minutes IS NOT NULL) AS horizons
       FROM scanner_hits h
       LEFT JOIN scanner_outcomes o ON o.scanner_hit_id = h.id
      WHERE h.detected_at > now() - ($1 || ' minutes')::interval
      GROUP BY h.id
     HAVING count(o.horizon_minutes) < $2
      ORDER BY h.detected_at
      LIMIT $3`,
    [String(maxHorizon + 7 * 24 * 60), HORIZONS_MINUTES.length, OUTCOMES_PER_PASS],
  );

  let evaluated = 0;
  let abandoned = 0;
  let pending = 0;

  for (const hit of rows) {
    const detectedAt = new Date(hit.detected_at).getTime();
    const done = hit.horizons ?? [];
    const due = dueHorizons(detectedAt, now, done);
    if (due.length === 0) { pending++; continue; }

    try {
      const raw = await exchange.fetchOHLCV(
        toExchangeSymbol(hit.symbol), timeframe, detectedAt, CANDLES_PER_SCAN);
      const candles: OutcomeCandle[] = raw
        .filter((row) => row.length >= 5)
        .map((row) => ({ timestamp: row[0], high: row[2], low: row[3], close: row[4] }));

      for (const horizon of due) {
        const outcome = evaluateHorizon(Number(hit.price_at_hit), detectedAt, horizon, candles);

        if (!outcome) {
          // Pas de données : on réessaiera, sauf si l'horizon est périmé —
          // sinon la file se remplirait de détections impossibles à mesurer.
          if (horizonAbandoned(detectedAt, horizon, now)) {
            await pool.query(
              `INSERT INTO scanner_outcomes (scanner_hit_id, horizon_minutes, evaluated_at)
               VALUES ($1, $2, now())
               ON CONFLICT (scanner_hit_id, horizon_minutes) DO NOTHING`,
              [hit.id, horizon],
            );
            abandoned++;
          } else {
            pending++;
          }
          continue;
        }

        await pool.query(
          `INSERT INTO scanner_outcomes
             (scanner_hit_id, horizon_minutes, price_at_horizon, return_pct,
              max_favorable_pct, max_adverse_pct, evaluated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (scanner_hit_id, horizon_minutes) DO UPDATE SET
             price_at_horizon = EXCLUDED.price_at_horizon,
             return_pct = EXCLUDED.return_pct,
             max_favorable_pct = EXCLUDED.max_favorable_pct,
             max_adverse_pct = EXCLUDED.max_adverse_pct,
             evaluated_at = EXCLUDED.evaluated_at`,
          [
            hit.id, horizon, outcome.priceAtHorizon, outcome.returnPct,
            outcome.maxFavorablePct, outcome.maxAdversePct,
          ],
        );
        evaluated++;
      }
    } catch (err) {
      logger.error({ err, symbol: hit.symbol, hitId: hit.id }, "scanner: évaluation d'horizon échouée");
    }
  }

  if (evaluated > 0 || abandoned > 0) {
    logger.info({ evaluated, abandoned, pending }, "scanner.outcomes");
  }
  return { evaluated, abandoned, pending };
}

// ── Boucles ──────────────────────────────────────────────────────────────

let scanHandle: ReturnType<typeof setInterval> | null = null;
let outcomeHandle: ReturnType<typeof setInterval> | null = null;

/** Un cycle complet : lit les réglages à chaque passage, puis scanne. */
export async function runScannerOnce(exchange: ScannerExchange): Promise<void> {
  // Les réglages sont relus à chaque cycle : couper le scanner dans l'interface
  // doit l'arrêter au cycle suivant, sans redémarrage.
  const loaded = await loadScannerSettings();
  if (!loaded) {
    logger.warn("scanner: aucune ligne scanner_settings (migration 0022 appliquée ?)");
    return;
  }

  const ports = buildPorts(exchange, loaded.timeframe);
  const summary = await runScanCycle(loaded.settings, ports);
  if (summary.ran) {
    await pool.query(`UPDATE scanner_settings SET last_scan_at = now() WHERE id = 1`);
  }
}

export function startScannerWorker(exchange: ScannerExchange, intervalMs = DEFAULT_SCAN_INTERVAL_MS): void {
  if (scanHandle) return;
  logger.info({ intervalMs }, "Démarrage du worker scanner (mode observation)");

  const scan = () => {
    void runScannerOnce(exchange).catch((err) => logger.error({ err }, "scanner: cycle échoué"));
  };
  const outcomes = () => {
    void loadScannerSettings()
      .then((loaded) => (loaded ? evaluateScannerOutcomes(exchange, loaded.timeframe) : undefined))
      .catch((err) => logger.error({ err }, "scanner: évaluation des horizons échouée"));
  };

  scan();
  scanHandle = setInterval(scan, intervalMs);
  outcomeHandle = setInterval(outcomes, OUTCOME_INTERVAL_MS);
}

export function stopScannerWorker(): void {
  if (scanHandle) { clearInterval(scanHandle); scanHandle = null; }
  if (outcomeHandle) { clearInterval(outcomeHandle); outcomeHandle = null; }
}
