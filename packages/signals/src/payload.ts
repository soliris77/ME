/**
 * Lecture du corps d'un webhook.
 *
 * Les plateformes d'alertes ne s'accordent sur aucun nom de champ. Plutôt que
 * d'imposer un format, on accepte les noms courants et on refuse clairement ce
 * qu'on ne comprend pas — un signal mal lu est pire qu'un signal rejeté.
 */

export interface ParsedSignal {
  sourceSignalId: string;
  symbol: string;
  action: string;
  /** epoch ms, ou null si la source n'en fournit pas d'exploitable. */
  emittedAt: number | null;
  referencePrice: number | null;
}

export interface ParseError {
  error: string;
}

export function parseSignalBody(raw: unknown): ParsedSignal | ParseError {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'corps JSON attendu' };
  }
  const body = raw as Record<string, unknown>;

  const id = firstValue(body, ['id', 'signal_id', 'alert_id', 'uuid']);
  if (!id) return { error: 'identifiant de signal manquant' };

  const symbol = firstValue(body, ['symbol', 'ticker', 'pair', 'instrument']);
  if (!symbol) return { error: 'symbole manquant' };

  const action = firstValue(body, ['action', 'side', 'signal', 'order']);
  if (!action) return { error: 'action manquante' };

  return {
    sourceSignalId: id.slice(0, 200),
    symbol: normalizeSymbol(symbol),
    action: action.slice(0, 50),
    emittedAt: parseTimestamp(firstValue(body, ['emitted_at', 'time', 'timestamp'])),
    referencePrice: parsePrice(firstValue(body, ['price', 'reference_price', 'close'])),
  };
}

/**
 * Un horodatage illisible ne fait pas échouer le signal : il reste vide. On
 * préfère ne rien savoir de l'heure d'émission qu'enregistrer une date fausse,
 * qui ferait ensuite passer un signal frais pour périmé.
 */
export function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    // Au-delà de 1e12, c'est déjà en millisecondes ; en deçà, en secondes.
    const ms = asNumber > 1e12 ? asNumber : asNumber * 1000;
    return Number.isFinite(ms) ? Math.round(ms) : null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parsePrice(value: string | undefined): number | null {
  if (value === undefined) return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** 'BTCUSD', 'BTC/USD', 'btc-usd' -> 'BTC-USD'. */
export function normalizeSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (upper.includes('-')) return upper;
  if (upper.includes('/')) return upper.replace('/', '-');
  // Sans séparateur, on ne devine que les devises de cotation qu'on utilise.
  // Ordre important : USDT et USDC avant USD, sinon 'BTCUSDT' devient 'BTC-USDT'
  // seulement par chance.
  for (const quote of ['USDT', 'USDC', 'USD', 'CAD', 'EUR']) {
    if (upper.length > quote.length && upper.endsWith(quote)) {
      return `${upper.slice(0, upper.length - quote.length)}-${quote}`;
    }
  }
  return upper;
}

function firstValue(body: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}
