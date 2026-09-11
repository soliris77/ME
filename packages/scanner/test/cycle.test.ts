import { describe, it, expect } from 'vitest';
import { runScanCycle } from '../src/cycle';
import type { ScanCyclePorts, ScanSettings, ScannerHit } from '../src/cycle';
import type { ScanCandidate } from '../src/types';
import type { ScoreCandle } from '../src/score';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

const settings: ScanSettings = {
  enabled: true,
  mode: 'shadow',
  universe: {
    quoteCurrency: 'USD',
    minQuoteVolume24h: 500_000,
    maxSpreadPct: 0.5,
    excludedSymbols: [],
  },
  alert: { scoreThreshold: 60, cooldownMinutes: 60, maxAlertsPerHour: 5 },
  recordScoreThreshold: 40,
  maxSymbolsPerCycle: 50,
};

/** Série calme qui se met à courir sur les 4 dernières bougies. */
function runningSeries(): ScoreCandle[] {
  const candles: ScoreCandle[] = Array.from({ length: 150 }, () => ({ close: 100, volume: 10 }));
  for (let i = candles.length - 4; i < candles.length; i++) {
    candles[i] = { close: 100 + (i - (candles.length - 5)) * 1.5, volume: 60 };
  }
  return candles;
}

/** Série parfaitement plate : score nul. */
function flatSeries(): ScoreCandle[] {
  return Array.from({ length: 150 }, () => ({ close: 100, volume: 10 }));
}

function candidate(symbol: string, volume = 10_000_000, spread = 0.1): ScanCandidate {
  return { symbol, lastPrice: 100, quoteVolume24h: volume, spreadPct: spread };
}

interface Recorder {
  ports: ScanCyclePorts;
  recorded: ScannerHit[];
  alertedIds: number[];
  emails: ScannerHit[][];
}

function makePorts(overrides: Partial<ScanCyclePorts> & {
  candidates?: ScanCandidate[];
  series?: Record<string, ScoreCandle[]>;
} = {}): Recorder {
  const recorded: ScannerHit[] = [];
  const alertedIds: number[] = [];
  const emails: ScannerHit[][] = [];
  const series = overrides.series ?? {};
  let nextId = 1;

  const ports: ScanCyclePorts = {
    listCandidates: async () => overrides.candidates ?? [],
    loadSeries: async (symbol: string) =>
      series[symbol] ? { candles: series[symbol], atr: 1 } : null,
    loadAlertState: async () => ({ lastAlertBySymbol: new Map(), alertsSentLastHour: 0 }),
    recordHit: async (hit) => { recorded.push(hit); return nextId++; },
    markAlerted: async (id) => { alertedIds.push(id); },
    sendAlert: async (hits) => { emails.push([...hits]); },
    now: () => NOW,
    ...overrides,
  };

  return { ports, recorded, alertedIds, emails };
}

describe('runScanCycle', () => {
  it('ne touche à rien quand le scanner est désactivé', async () => {
    let called = false;
    const { ports } = makePorts({ listCandidates: async () => { called = true; return []; } });
    const summary = await runScanCycle({ ...settings, enabled: false }, ports);
    expect(summary.ran).toBe(false);
    expect(called).toBe(false);
  });

  it('ne touche à rien en mode disabled même si enabled est vrai', async () => {
    let called = false;
    const { ports } = makePorts({ listCandidates: async () => { called = true; return []; } });
    const summary = await runScanCycle({ ...settings, mode: 'disabled' }, ports);
    expect(summary.ran).toBe(false);
    expect(called).toBe(false);
  });

  it('enregistre et alerte une paire qui se met à courir', async () => {
    const { ports, recorded, alertedIds, emails } = makePorts({
      candidates: [candidate('SOL-USD')],
      series: { 'SOL-USD': runningSeries() },
    });
    const summary = await runScanCycle(settings, ports);

    expect(summary.ran).toBe(true);
    expect(summary.retained).toBe(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].symbol).toBe('SOL-USD');
    expect(recorded[0].detectedAt).toBe(NOW);
    expect(alertedIds).toEqual([1]);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toHaveLength(1);
  });

  it("n'enregistre rien pour une paire qui ne bouge pas", async () => {
    const { ports, recorded, emails } = makePorts({
      candidates: [candidate('BTC-USD')],
      series: { 'BTC-USD': flatSeries() },
    });
    const summary = await runScanCycle(settings, ports);
    expect(summary.scored).toBe(1);
    expect(recorded).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });

  it('écarte une paire illiquide avant tout appel de série', async () => {
    let loaded = 0;
    const { ports, recorded } = makePorts({
      candidates: [candidate('TINY-USD', 1_000)],
      loadSeries: async () => { loaded++; return null; },
    });
    const summary = await runScanCycle(settings, ports);
    expect(loaded).toBe(0);
    expect(summary.retained).toBe(0);
    expect(summary.rejections.volume_trop_faible).toBe(1);
    expect(recorded).toHaveLength(0);
  });

  it("une paire en échec ne fait pas tomber les autres", async () => {
    const series = { 'SOL-USD': runningSeries() };
    const { ports, recorded } = makePorts({
      candidates: [candidate('BAD-USD'), candidate('SOL-USD')],
      loadSeries: async (symbol: string) => {
        if (symbol === 'BAD-USD') throw new Error('flux indisponible');
        return series[symbol as keyof typeof series]
          ? { candles: series[symbol as keyof typeof series], atr: 1 }
          : null;
      },
    });
    const summary = await runScanCycle(settings, ports);
    expect(summary.failures).toEqual([{ symbol: 'BAD-USD', error: 'flux indisponible' }]);
    expect(recorded.map(h => h.symbol)).toEqual(['SOL-USD']);
  });

  it('respecte le plafond de paires examinées par cycle', async () => {
    const examined: string[] = [];
    const { ports } = makePorts({
      candidates: [
        candidate('A-USD', 1_000_000),
        candidate('B-USD', 9_000_000),
        candidate('C-USD', 5_000_000),
      ],
      loadSeries: async (symbol: string) => { examined.push(symbol); return null; },
    });
    await runScanCycle({ ...settings, maxSymbolsPerCycle: 2 }, ports);
    // Les plus liquides d'abord.
    expect(examined).toEqual(['B-USD', 'C-USD']);
  });

  it("un envoi de courriel en échec n'annule pas l'enregistrement", async () => {
    const { ports, recorded } = makePorts({
      candidates: [candidate('SOL-USD')],
      series: { 'SOL-USD': runningSeries() },
      sendAlert: async () => { throw new Error('resend indisponible'); },
    });
    const summary = await runScanCycle(settings, ports);
    expect(recorded).toHaveLength(1);
    expect(summary.recorded).toBe(1);
    expect(summary.failures[0].symbol).toBe('(alerte)');
  });

  it('enregistre sans alerter quand le score est sous le seuil d\'alerte', async () => {
    const { ports, recorded, emails } = makePorts({
      candidates: [candidate('SOL-USD')],
      series: { 'SOL-USD': runningSeries() },
    });
    const summary = await runScanCycle({ ...settings, alert: { ...settings.alert, scoreThreshold: 99 } }, ports);
    expect(recorded).toHaveLength(1);
    expect(emails).toHaveLength(0);
    expect(summary.alerted).toBe(0);
    expect(summary.skippedAlerts[0].reason).toBe('score_insuffisant');
  });
});
