/**
 * Scanner d'opportunités — types.
 *
 * Le scanner ne calcule aucun indicateur lui-même : l'ATR lui est fourni par
 * l'appelant, qui l'obtient de @workspace/indicators. C'est ce qui garantit
 * qu'il n'existe jamais deux définitions d'ATR dans le dépôt.
 */

export interface ScanCandidate {
  symbol: string;            // format interne : 'SOL-USD'
  lastPrice: number;
  quoteVolume24h: number;
  spreadPct: number;         // (ask - bid) / mid * 100, relevé au moment du scan
}

export interface MomentumScore {
  symbol: string;
  score: number;             // 0..100
  rocPct: number;            // variation sur la fenêtre courte
  rocBaselinePct: number;    // variation moyenne habituelle, même durée
  volumeRatio: number;       // volume courant / médiane des 20 dernières périodes
  atrMultiple: number;       // amplitude du mouvement en multiples d'ATR
  extensionAtr: number;      // distance au point de cassure, en ATR
  tooExtended: boolean;      // true => signaler, ne pas entrer
  reasons: string[];
}

export interface ScoreWeights {
  acceleration: number;
  volume: number;
  amplitude: number;
}

export interface UniverseFilter {
  quoteCurrency: string;
  minQuoteVolume24h: number;
  maxSpreadPct: number;
  excludedSymbols: readonly string[];
}

export type ScannerMode = 'shadow' | 'armed' | 'disabled';
