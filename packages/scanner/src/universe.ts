/**
 * Construction de l'univers scanné.
 *
 * C'est ici que se joue la protection principale contre les paires
 * intradables : le plancher de liquidité. Une paire qui fait +400 % mais
 * qu'on ne peut pas revendre n'est pas une opportunité.
 */
import type { ScanCandidate, UniverseFilter } from './types';

/** Suffixes de produits à effet de levier et dérivés, exclus d'office. */
const LEVERAGED_PATTERNS = [/\d+[LS]$/i, /UP$/i, /DOWN$/i, /BULL$/i, /BEAR$/i, /\.d$/i];

export interface UniverseRejection {
  symbol: string;
  reason: 'quote_currency' | 'leveraged' | 'volume_trop_faible' | 'spread_trop_large' | 'exclu_manuellement';
}

export interface UniverseResult {
  retained: ScanCandidate[];
  rejected: UniverseRejection[];
}

export function buildUniverse(
  candidates: readonly ScanCandidate[],
  filter: UniverseFilter,
): UniverseResult {
  const retained: ScanCandidate[] = [];
  const rejected: UniverseRejection[] = [];
  const excluded = new Set(filter.excludedSymbols);

  for (const candidate of candidates) {
    const [base, quote] = splitSymbol(candidate.symbol);

    if (quote !== filter.quoteCurrency) {
      rejected.push({ symbol: candidate.symbol, reason: 'quote_currency' });
      continue;
    }
    if (excluded.has(candidate.symbol)) {
      rejected.push({ symbol: candidate.symbol, reason: 'exclu_manuellement' });
      continue;
    }
    if (LEVERAGED_PATTERNS.some(p => p.test(base))) {
      rejected.push({ symbol: candidate.symbol, reason: 'leveraged' });
      continue;
    }
    if (candidate.quoteVolume24h < filter.minQuoteVolume24h) {
      rejected.push({ symbol: candidate.symbol, reason: 'volume_trop_faible' });
      continue;
    }
    if (candidate.spreadPct > filter.maxSpreadPct) {
      rejected.push({ symbol: candidate.symbol, reason: 'spread_trop_large' });
      continue;
    }
    retained.push(candidate);
  }

  return { retained, rejected };
}

/** 'BTC-USD' -> ['BTC', 'USD'] */
export function splitSymbol(symbol: string): [string, string] {
  const index = symbol.lastIndexOf('-');
  if (index < 0) return [symbol, ''];
  return [symbol.slice(0, index), symbol.slice(index + 1)];
}

/**
 * Relu juste avant d'envoyer un ordre, pas seulement au scan : un carnet peut
 * s'être vidé entre les deux. C'est ce contrôle qui sauve sur les paires minces.
 */
export function spreadAcceptable(spreadPct: number, maxSpreadPct: number): boolean {
  return Number.isFinite(spreadPct) && spreadPct >= 0 && spreadPct <= maxSpreadPct;
}
