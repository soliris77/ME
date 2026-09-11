import { describe, it, expect } from 'vitest';
import { selectAlerts } from '../src/alerts';
import type { AlertPolicy, AlertState } from '../src/alerts';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const MIN = 60_000;

const policy: AlertPolicy = { scoreThreshold: 70, cooldownMinutes: 60, maxAlertsPerHour: 3 };
const fresh: AlertState = { lastAlertBySymbol: new Map(), alertsSentLastHour: 0 };

describe('selectAlerts', () => {
  it('retient une paire au-dessus du seuil', () => {
    const { alerts } = selectAlerts([{ symbol: 'SOL-USD', score: 82 }], policy, fresh, NOW);
    expect(alerts.map(a => a.symbol)).toEqual(['SOL-USD']);
  });

  it('écarte une paire sous le seuil', () => {
    const { alerts, skipped } = selectAlerts([{ symbol: 'SOL-USD', score: 69 }], policy, fresh, NOW);
    expect(alerts).toHaveLength(0);
    expect(skipped[0].reason).toBe('score_insuffisant');
  });

  it('écarte une paire déjà alertée dans le cooldown', () => {
    const state: AlertState = {
      lastAlertBySymbol: new Map([['SOL-USD', NOW - 20 * MIN]]),
      alertsSentLastHour: 1,
    };
    const { alerts, skipped } = selectAlerts([{ symbol: 'SOL-USD', score: 95 }], policy, state, NOW);
    expect(alerts).toHaveLength(0);
    expect(skipped[0].reason).toBe('cooldown');
  });

  it('réalerte une fois le cooldown passé', () => {
    const state: AlertState = {
      lastAlertBySymbol: new Map([['SOL-USD', NOW - 90 * MIN]]),
      alertsSentLastHour: 0,
    };
    const { alerts } = selectAlerts([{ symbol: 'SOL-USD', score: 95 }], policy, state, NOW);
    expect(alerts).toHaveLength(1);
  });

  it('ne compte une même paire qu\'une fois par cycle', () => {
    const { alerts, skipped } = selectAlerts(
      [{ symbol: 'SOL-USD', score: 95 }, { symbol: 'SOL-USD', score: 91 }],
      { ...policy, cooldownMinutes: 0 },
      fresh,
      NOW,
    );
    expect(alerts).toHaveLength(1);
    expect(skipped[0].reason).toBe('cooldown');
  });

  it('respecte le plafond horaire et garde les meilleurs scores', () => {
    const { alerts, skipped } = selectAlerts(
      [
        { symbol: 'A-USD', score: 75 },
        { symbol: 'B-USD', score: 95 },
        { symbol: 'C-USD', score: 88 },
        { symbol: 'D-USD', score: 80 },
      ],
      policy,
      fresh,
      NOW,
    );
    expect(alerts.map(a => a.symbol)).toEqual(['B-USD', 'C-USD', 'D-USD']);
    expect(skipped).toEqual([{ symbol: 'A-USD', score: 75, reason: 'plafond_horaire' }]);
  });

  it('tient compte des alertes déjà envoyées dans l\'heure', () => {
    const state: AlertState = { lastAlertBySymbol: new Map(), alertsSentLastHour: 3 };
    const { alerts, skipped } = selectAlerts([{ symbol: 'B-USD', score: 99 }], policy, state, NOW);
    expect(alerts).toHaveLength(0);
    expect(skipped[0].reason).toBe('plafond_horaire');
  });
});
