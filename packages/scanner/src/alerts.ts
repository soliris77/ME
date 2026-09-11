/**
 * Politique d'alerte du scanner.
 *
 * Deux garde-fous, tous deux volontaires :
 *   1. anti-répétition par paire — une paire qui court pendant six heures ne
 *      doit pas produire vingt-quatre courriels ;
 *   2. plafond horaire global — si tout le marché part en même temps, on
 *      envoie les meilleures et on compte les autres, on ne noie pas la boîte.
 *
 * Les deux sont mesurés, pas devinés : ce qui est écarté est retourné avec sa
 * raison, pour être journalisé.
 */

export interface AlertPolicy {
  scoreThreshold: number;
  cooldownMinutes: number;
  maxAlertsPerHour: number;
}

export interface AlertState {
  /** Dernière alerte envoyée par paire (epoch ms). */
  lastAlertBySymbol: ReadonlyMap<string, number>;
  /** Alertes déjà envoyées dans l'heure glissante. */
  alertsSentLastHour: number;
}

export interface AlertCandidate {
  symbol: string;
  score: number;
}

export type AlertSkipReason = 'score_insuffisant' | 'cooldown' | 'plafond_horaire';

export interface AlertSelection<T extends AlertCandidate> {
  alerts: T[];
  skipped: { symbol: string; score: number; reason: AlertSkipReason }[];
}

export function selectAlerts<T extends AlertCandidate>(
  candidates: readonly T[],
  policy: AlertPolicy,
  state: AlertState,
  now: number,
): AlertSelection<T> {
  const alerts: T[] = [];
  const skipped: { symbol: string; score: number; reason: AlertSkipReason }[] = [];

  // Meilleur score d'abord : si le plafond horaire mord, il mord sur les moins bonnes.
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  const cooldownMs = Math.max(0, policy.cooldownMinutes) * 60_000;
  let budget = Math.max(0, policy.maxAlertsPerHour - state.alertsSentLastHour);
  const seen = new Set<string>();

  for (const candidate of ordered) {
    if (candidate.score < policy.scoreThreshold) {
      skipped.push({ symbol: candidate.symbol, score: candidate.score, reason: 'score_insuffisant' });
      continue;
    }

    // Une même paire peut apparaître deux fois dans un cycle : la deuxième
    // occurrence est une répétition, quel que soit le cooldown configuré.
    if (seen.has(candidate.symbol)) {
      skipped.push({ symbol: candidate.symbol, score: candidate.score, reason: 'cooldown' });
      continue;
    }

    const lastAlert = state.lastAlertBySymbol.get(candidate.symbol);
    if (lastAlert !== undefined && now - lastAlert < cooldownMs) {
      skipped.push({ symbol: candidate.symbol, score: candidate.score, reason: 'cooldown' });
      continue;
    }

    if (budget <= 0) {
      skipped.push({ symbol: candidate.symbol, score: candidate.score, reason: 'plafond_horaire' });
      continue;
    }

    alerts.push(candidate);
    seen.add(candidate.symbol);
    budget--;
  }

  return { alerts, skipped };
}
