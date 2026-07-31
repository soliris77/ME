import YahooFinanceClass from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const yahooFinance = new (YahooFinanceClass as any)({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false, logOptionsErrors: false },
});

const TYPE_MAP: Record<string, string> = {
  EQUITY: "stock",
  ETF: "etf",
  CRYPTOCURRENCY: "crypto",
  INDEX: "index",
  MUTUALFUND: "stock",
  FUTURE: "stock",
};

export function mapQuoteType(quoteType?: string): string {
  if (!quoteType) return "stock";
  return TYPE_MAP[quoteType.toUpperCase()] ?? "stock";
}

export interface FormattedQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  marketCap: number | null;
  currency: string;
  type: string;
  exchange: string | null;
  lastUpdated: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatQuote(q: any): FormattedQuote {
  return {
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.symbol,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePercent: q.regularMarketChangePercent ?? 0,
    previousClose: q.regularMarketPreviousClose ?? null,
    open: q.regularMarketOpen ?? null,
    high: q.regularMarketDayHigh ?? null,
    low: q.regularMarketDayLow ?? null,
    volume: q.regularMarketVolume ?? null,
    marketCap: q.marketCap ?? null,
    currency: typeof q.currency === "string" ? q.currency : (q.currency?.code ?? "USD"),
    type: mapQuoteType(q.quoteType),
    exchange: (typeof q.fullExchangeName === "string" ? q.fullExchangeName : null)
           ?? (typeof q.exchange === "string" ? q.exchange : null)
           ?? null,
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Asset profiles (secteur / type) — cache serveur 24 h ─────────────────────
// Utilisé pour la répartition du portefeuille : le secteur vient du module
// assetProfile de Yahoo (quoteSummary). Les FNB/cryptos n'ont pas de secteur —
// on renvoie sector:null et le quoteType pour que l'appelant les classe
// explicitement (jamais de secteur inventé par défaut).

export interface AssetProfile {
  sector: string | null;
  quoteType: string | null;
}

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — le secteur d'un titre ne bouge pas
const profileCache = new Map<string, { profile: AssetProfile; at: number }>();

async function fetchProfile(symbol: string): Promise<AssetProfile> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = await yahooFinance.quoteSummary(
      symbol,
      { modules: ["assetProfile", "quoteType"] },
      { validateResult: false },
    );
    return {
      sector: typeof s?.assetProfile?.sector === "string" && s.assetProfile.sector ? s.assetProfile.sector : null,
      quoteType: typeof s?.quoteType?.quoteType === "string" ? s.quoteType.quoteType : null,
    };
  } catch {
    return { sector: null, quoteType: null };
  }
}

/**
 * Profils (secteur + type) pour une liste de symboles, avec cache mémoire 24 h.
 * Les symboles manquants dans la Map résultat n'existent pas — l'appelant doit
 * les traiter comme « secteur inconnu », pas les ignorer silencieusement.
 */
export async function getAssetProfiles(symbols: string[]): Promise<Map<string, AssetProfile>> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const out = new Map<string, AssetProfile>();
  const toFetch: string[] = [];
  const now = Date.now();

  for (const sym of unique) {
    const cached = profileCache.get(sym);
    if (cached && now - cached.at < PROFILE_TTL_MS) {
      out.set(sym, cached.profile);
    } else {
      toFetch.push(sym);
    }
  }

  // Parallélisme limité — quoteSummary est un appel par symbole
  const CONCURRENCY = 6;
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const chunk = toFetch.slice(i, i + CONCURRENCY);
    const profiles = await Promise.all(chunk.map(fetchProfile));
    chunk.forEach((sym, idx) => {
      profileCache.set(sym, { profile: profiles[idx], at: Date.now() });
      out.set(sym, profiles[idx]);
    });
  }

  return out;
}

/**
 * Fetch a single symbol individually (used for retries and individual lookups).
 */
async function fetchSingle(sym: string): Promise<FormattedQuote | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await (yahooFinance.quote(sym, {}, { skipValidation: true }) as Promise<any>);
    if (!q) return null;
    return formatQuote({ ...q, symbol: sym });
  } catch {
    return null;
  }
}

/**
 * Batch-fetch quotes for a list of symbols using Yahoo Finance's multi-symbol
 * endpoint. Symbols are chunked into groups of 50 and fetched in parallel
 * batches — drastically faster than one request per symbol.
 *
 * Symbols that return null in batch mode (futures like GC=F, currencies like
 * EURUSD=X) are automatically retried individually in parallel.
 */
export async function getQuotes(symbols: string[]): Promise<FormattedQuote[]> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const BATCH_SIZE = 50;
  const PARALLEL_BATCHES = 4;
  const out: FormattedQuote[] = [];

  for (let i = 0; i < unique.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
    const windowSymbols = unique.slice(i, i + BATCH_SIZE * PARALLEL_BATCHES);

    // Split window into batches of BATCH_SIZE
    const batches: string[][] = [];
    for (let j = 0; j < windowSymbols.length; j += BATCH_SIZE) {
      batches.push(windowSymbols.slice(j, j + BATCH_SIZE));
    }

    // Fetch all batches in parallel; each returns an array aligned with its input
    const batchResults = await Promise.all(
      batches.map(async (batch) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (yahooFinance.quote(batch as any, {}, { skipValidation: true }) as Promise<any>);
          const arr: unknown[] = Array.isArray(res) ? res : [res];
          // Override returned symbol with the requested one — Yahoo batch sometimes
          // returns contract-specific symbols (e.g. "GCQ26.CMX" for "GC=F").
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return arr.map((q: any, idx: number) =>
            q ? { ...q, symbol: batch[idx] ?? q.symbol } : null,
          );
        } catch {
          return new Array(batch.length).fill(null);
        }
      }),
    );

    // Flatten results, tracking which requested symbols got null back
    const missedSymbols: string[] = [];
    for (let b = 0; b < batches.length; b++) {
      const batchResult = batchResults[b];
      for (let k = 0; k < batches[b].length; k++) {
        const q = batchResult[k];
        if (q) {
          out.push(formatQuote(q));
        } else {
          // Symbol returned null in batch — schedule individual retry
          missedSymbols.push(batches[b][k]);
        }
      }
    }

    // Retry missed symbols individually in parallel (futures, currencies, etc.)
    if (missedSymbols.length > 0) {
      const retried = await Promise.all(missedSymbols.map(fetchSingle));
      for (const q of retried) {
        if (q) out.push(q);
      }
    }
  }

  return out;
}
