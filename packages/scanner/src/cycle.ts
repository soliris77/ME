/**
 * Le cycle de scan.
 *
 * Ce fichier ne parle ni à une base de données ni à une bourse : tout passe
 * par des ports injectés. C'est ce qui permet de le tester sans réseau, et
 * c'est aussi ce qui rend visible, en une page, tout ce que le scanner fait.
 *
 * Ce qu'il ne fait PAS, et ne doit jamais faire : passer un ordre. Le scanner
 * détecte, enregistre et alerte. L'entrée en position passe par le RiskGate
 * comme tout le reste, dans un autre fichier, sous l'enveloppe d'opportunité.
 */
import type { ScanCandidate, ScannerMode, UniverseFilter } from './types';
import { buildUniverse } from './universe';
import { computeMomentum, type ScoreCandle } from './score';
import { selectAlerts, type AlertPolicy, type AlertState } from './alerts';

export interface ScanSettings {
  enabled: boolean;
  mode: ScannerMode;
  universe: UniverseFilter;
  alert: AlertPolicy;
  /** Score minimal pour écrire une ligne dans scanner_hits. */
  recordScoreThreshold: number;
  /** Plafond de paires examinées par cycle — protège des limites de débit. */
  maxSymbolsPerCycle: number;
}

export interface ScannerHit {
  symbol: string;
  detectedAt: number;
  score: number;
  rocPct: number;
  volumeRatio: number;
  atrMultiple: number;
  extensionAtr: number;
  quoteVolume24h: number;
  spreadPct: number;
  priceAtHit: number;
  reasons: string[];
  tooExtended: boolean;
}

export interface ScanCyclePorts {
  listCandidates(): Promise<readonly ScanCandidate[]>;
  /**
   * Série et ATR de la paire. L'ATR vient de @workspace/indicators, calculé
   * par l'appelant : le scanner n'en possède aucune définition propre.
   */
  loadSeries(symbol: string): Promise<{ candles: readonly ScoreCandle[]; atr: number } | null>;
  loadAlertState(): Promise<AlertState>;
  /** Écrit la détection et retourne son identifiant. */
  recordHit(hit: ScannerHit): Promise<number>;
  markAlerted(hitId: number): Promise<void>;
  sendAlert(hits: readonly ScannerHit[]): Promise<void>;
  now(): number;
  log?(event: string, data: Record<string, unknown>): void;
}

export interface ScanCycleSummary {
  ran: boolean;
  scanned: number;
  retained: number;
  scored: number;
  recorded: number;
  alerted: number;
  failures: { symbol: string; error: string }[];
  skippedAlerts: { symbol: string; score: number; reason: string }[];
  rejections: Record<string, number>;
}

const EMPTY_SUMMARY: ScanCycleSummary = {
  ran: false, scanned: 0, retained: 0, scored: 0, recorded: 0,
  alerted: 0, failures: [], skippedAlerts: [], rejections: {},
};

export async function runScanCycle(
  settings: ScanSettings,
  ports: ScanCyclePorts,
): Promise<ScanCycleSummary> {
  const log = ports.log ?? (() => {});

  // Deux verrous indépendants : l'interrupteur global et le mode. Il faut que
  // les deux soient ouverts pour qu'un seul appel réseau parte.
  if (!settings.enabled || settings.mode === 'disabled') {
    log('scanner.skipped', { enabled: settings.enabled, mode: settings.mode });
    return { ...EMPTY_SUMMARY };
  }

  const candidates = await ports.listCandidates();
  const { retained, rejected } = buildUniverse(candidates, settings.universe);

  const rejections: Record<string, number> = {};
  for (const r of rejected) rejections[r.reason] = (rejections[r.reason] ?? 0) + 1;

  const shortlist = [...retained]
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
    .slice(0, Math.max(0, settings.maxSymbolsPerCycle));

  const hits: ScannerHit[] = [];
  const failures: { symbol: string; error: string }[] = [];
  let scored = 0;

  for (const candidate of shortlist) {
    try {
      const series = await ports.loadSeries(candidate.symbol);
      if (!series) continue;

      const momentum = computeMomentum(candidate.symbol, series.candles, series.atr);
      if (!momentum) continue;
      scored++;

      if (momentum.score < settings.recordScoreThreshold) continue;

      hits.push({
        symbol: candidate.symbol,
        detectedAt: ports.now(),
        score: momentum.score,
        rocPct: momentum.rocPct,
        volumeRatio: momentum.volumeRatio,
        atrMultiple: momentum.atrMultiple,
        extensionAtr: momentum.extensionAtr,
        quoteVolume24h: candidate.quoteVolume24h,
        spreadPct: candidate.spreadPct,
        priceAtHit: candidate.lastPrice,
        reasons: momentum.reasons,
        tooExtended: momentum.tooExtended,
      });
    } catch (error) {
      // Une paire qui échoue ne fait pas tomber le cycle : c'est exactement
      // le genre de panne qui ferait rater les autres opportunités.
      failures.push({ symbol: candidate.symbol, error: describe(error) });
    }
  }

  const state = await ports.loadAlertState();
  const selection = selectAlerts(hits, settings.alert, state, ports.now());
  const toAlert = new Set(selection.alerts.map(h => h.symbol));

  let recorded = 0;
  const alerted: ScannerHit[] = [];

  for (const hit of hits) {
    try {
      const id = await ports.recordHit(hit);
      recorded++;
      if (toAlert.has(hit.symbol)) {
        await ports.markAlerted(id);
        alerted.push(hit);
      }
    } catch (error) {
      failures.push({ symbol: hit.symbol, error: describe(error) });
    }
  }

  // Un seul courriel par cycle, jamais un par paire.
  if (alerted.length > 0) {
    try {
      await ports.sendAlert(alerted);
    } catch (error) {
      failures.push({ symbol: '(alerte)', error: describe(error) });
    }
  }

  const summary: ScanCycleSummary = {
    ran: true,
    scanned: candidates.length,
    retained: retained.length,
    scored,
    recorded,
    alerted: alerted.length,
    failures,
    skippedAlerts: selection.skipped,
    rejections,
  };

  log('scanner.cycle', { ...summary, mode: settings.mode });
  return summary;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
