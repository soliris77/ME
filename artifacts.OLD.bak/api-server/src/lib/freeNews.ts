import { yahooFinance } from "./yahoo";
import { logger } from "./logger";

/**
 * Journal des marchés — 100% gratuit, sans clé API ni compte à créer :
 *  - Actualités liées à un titre précis : yahoo-finance2 (déjà utilisée pour les prix)
 *  - Actualités classées par thème : flux RSS public de Google News (aucune clé)
 *
 * On garde un petit cache mémoire (10 min) pour éviter de re-frapper les
 * mêmes flux à chaque rafraîchissement de page.
 */

export type SentimentLabel = "haussier" | "baissier" | "neutre";

export interface NewsTickerSentiment {
  ticker: string;
  relevanceScore: number;
  sentimentScore: number;
  sentimentLabel: SentimentLabel;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  theme: string;
  overallSentimentScore: number;
  overallSentimentLabel: SentimentLabel;
  tickers: NewsTickerSentiment[];
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; data: NewsItem[] }>();

// --- Estimation de sentiment très simple, par mots-clés (aucun coût, aucune clé) ---
const BULLISH_WORDS = [
  "hausse", "bondit", "grimpe", "record", "optimis", "rebond", "croissance", "profit",
  "surperforme", "rallye", "soars", "surge", "rally", "jumps", "gains", "beats", "outperform",
];
const BEARISH_WORDS = [
  "chute", "recul", "baisse", "plonge", "effondr", "perte", "déficit", "crainte", "récession",
  "misses", "plunge", "slump", "selloff", "tumbles", "falls", "drops", "losses", "fear", "warns",
];

function estimateSentiment(text: string): { label: SentimentLabel; score: number } {
  const t = text.toLowerCase();
  let score = 0;
  for (const w of BULLISH_WORDS) if (t.includes(w)) score += 1;
  for (const w of BEARISH_WORDS) if (t.includes(w)) score -= 1;
  const label: SentimentLabel = score > 0 ? "haussier" : score < 0 ? "baissier" : "neutre";
  return { label, score: Math.max(-1, Math.min(1, score / 3)) };
}

// --- Petit parseur RSS/XML "fait maison" (regex) — pas besoin de dépendance externe ---
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1]) : "";
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const rawTitle = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    // Google News met souvent le titre sous la forme "Titre - Nom du média"
    const dashIdx = rawTitle.lastIndexOf(" - ");
    const source = sourceMatch
      ? decodeEntities(sourceMatch[1])
      : dashIdx > -1
      ? rawTitle.slice(dashIdx + 3)
      : "Google News";
    const title = dashIdx > -1 && !sourceMatch ? rawTitle.slice(0, dashIdx) : rawTitle;
    if (title && link) items.push({ title, link, pubDate, source });
  }
  return items;
}

async function fetchGoogleNewsRss(query: string, limit: number): Promise<RssItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr-CA&gl=CA&ceid=CA:fr`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseRssItems(xml).slice(0, limit);
    if (items.length === 0) {
      logger.warn({ query, status: res.status, xmlLength: xml.length }, "Flux Google News vide ou non parsé");
    }
    return items;
  } catch (err) {
    logger.error({ err, query }, "Échec de récupération du flux Google News");
    return [];
  }
}

function rssItemToNews(item: RssItem, theme: string): NewsItem {
  const { label, score } = estimateSentiment(item.title);
  return {
    id: item.link,
    title: item.title,
    summary: "",
    source: item.source,
    url: item.link,
    publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
    theme,
    overallSentimentScore: score,
    overallSentimentLabel: label,
    tickers: [],
  };
}

// Thèmes couverts par défaut — chacun est une recherche Google News distincte.
const THEME_FEEDS: { theme: string; query: string }[] = [
  { theme: "Marchés financiers", query: "marchés boursiers Wall Street TSX" },
  { theme: "Politique monétaire", query: "taux d'intérêt banque centrale Fed" },
  { theme: "Résultats d'entreprises", query: "résultats trimestriels bourse" },
  { theme: "Technologie", query: "actions technologiques bourse" },
  { theme: "Cryptomonnaies", query: "cryptomonnaie bitcoin marché" },
  { theme: "Économie", query: "inflation économie marché" },
];

async function fetchThemeNews(limitPerTheme: number): Promise<NewsItem[]> {
  const cacheKey = `themes:${limitPerTheme}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const results = await Promise.all(
    THEME_FEEDS.map(async (f) => {
      const items = await fetchGoogleNewsRss(f.query, limitPerTheme);
      return { theme: f.theme, count: items.length, items: items.map((it) => rssItemToNews(it, f.theme)) };
    })
  );
  logger.info(
    { counts: Object.fromEntries(results.map((r) => [r.theme, r.count])) },
    "Résumé des flux Google News par thème"
  );
  const flat = results.flatMap((r) => r.items);
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: flat });
  return flat;
}

async function fetchTickerNews(tickers: string[], limitPerTicker: number): Promise<NewsItem[]> {
  const cacheKey = `tickers:${tickers.join(",")}:${limitPerTicker}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const results = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await yahooFinance.search(ticker, { newsCount: limitPerTicker, quotesCount: 0 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const news: any[] = result?.news ?? [];
        return news.map((n): NewsItem => {
          const { label, score } = estimateSentiment(n.title ?? "");
          return {
            id: n.uuid ?? n.link,
            title: n.title ?? "",
            summary: "",
            source: n.publisher ?? "Yahoo Finance",
            url: n.link,
            publishedAt: n.providerPublishTime
              ? new Date(n.providerPublishTime * 1000).toISOString()
              : new Date().toISOString(),
            theme: "Actualité du titre",
            overallSentimentScore: score,
            overallSentimentLabel: label,
            tickers: [{ ticker, relevanceScore: 1, sentimentScore: score, sentimentLabel: label }],
          };
        });
      } catch (err) {
        logger.error({ err, ticker }, "Échec de récupération des news Yahoo Finance pour ce titre");
        return [];
      }
    })
  );
  const flat = results.flat();
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: flat });
  return flat;
}

export async function fetchMarketNews(opts: { tickers?: string; limit?: number } = {}): Promise<NewsItem[]> {
  const limit = opts.limit ?? 40;
  const tickers = opts.tickers
    ? opts.tickers.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const [themeNews, tickerNews] = await Promise.all([
    fetchThemeNews(6),
    tickers.length > 0 ? fetchTickerNews(tickers, 6) : Promise.resolve([]),
  ]);

  const combined = [...tickerNews, ...themeNews].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return combined.slice(0, limit);
}
