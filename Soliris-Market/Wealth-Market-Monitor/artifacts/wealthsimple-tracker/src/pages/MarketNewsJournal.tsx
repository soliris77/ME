import { useGetMarketNews } from "@workspace/api-client-react";
import type { NewsItem } from "@workspace/api-client-react";
import { useMemo, useState, useEffect } from "react";
import { Newspaper, ExternalLink, TrendingUp, TrendingDown, Minus, Pin, PinOff, RefreshCw } from "lucide-react";

const PINNED_KEY = "ws-marches-journal-epingles";

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePinned(ids: string[]) {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diffMin = Math.round((Date.now() - d) / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffJ = Math.round(diffH / 24);
  return `il y a ${diffJ} j`;
}

function SentimentBadge({ label, score }: { label: NewsItem["overallSentimentLabel"]; score: number }) {
  const config = {
    haussier: { icon: TrendingUp, cls: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", text: "Haussier" },
    baissier: { icon: TrendingDown, cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", text: "Baissier" },
    neutre: { icon: Minus, cls: "bg-muted text-muted-foreground border-card-border", text: "Neutre" },
  }[label];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.cls}`}>
      <Icon className="w-3 h-3" />
      {config.text}
    </span>
  );
}

function NewsCard({ item, pinned, onTogglePin }: { item: NewsItem; pinned: boolean; onTogglePin: (id: string) => void }) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            {item.theme}
          </span>
          <SentimentBadge label={item.overallSentimentLabel} score={item.overallSentimentScore} />
        </div>
        <button
          onClick={() => onTogglePin(item.id)}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
          title={pinned ? "Retirer du journal épinglé" : "Épingler dans mon journal"}
        >
          {pinned ? <Pin className="w-4 h-4 fill-current text-primary" /> : <PinOff className="w-4 h-4" />}
        </button>
      </div>

      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block group">
        <h3 className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors flex items-start gap-1.5">
          {item.title}
          <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-50" />
        </h3>
      </a>

      {item.tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {item.tickers.slice(0, 6).map((t) => (
            <span
              key={t.ticker}
              className={`text-[11px] font-mono px-1.5 py-0.5 rounded border ${
                t.sentimentLabel === "haussier"
                  ? "border-green-500/30 text-green-600 dark:text-green-400"
                  : t.sentimentLabel === "baissier"
                  ? "border-red-500/30 text-red-600 dark:text-red-400"
                  : "border-card-border text-muted-foreground"
              }`}
            >
              {t.ticker}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>{item.source}</span>
        <span>{timeAgo(item.publishedAt)}</span>
      </div>
    </div>
  );
}

export default function MarketNewsJournal() {
  const [activeTheme, setActiveTheme] = useState<string>("Tous");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [pinned, setPinned] = useState<string[]>(() => loadPinned());

  const { data: news = [], isLoading, isError, error, refetch, isFetching } = useGetMarketNews(
    { limit: 60 },
    { query: { refetchInterval: 15 * 60_000 } },
  );

  useEffect(() => savePinned(pinned), [pinned]);

  const togglePin = (id: string) => {
    setPinned((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const themes = useMemo(() => {
    const set = new Set<string>();
    news.forEach((n) => set.add(n.theme));
    return ["Tous", ...Array.from(set).sort()];
  }, [news]);

  const filtered = useMemo(() => {
    let list = news;
    if (activeTheme !== "Tous") list = list.filter((n) => n.theme === activeTheme);
    if (showPinnedOnly) list = list.filter((n) => pinned.includes(n.id));
    return list;
  }, [news, activeTheme, showPinnedOnly, pinned]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary" />
            Journal des marchés
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Les actualités qui font bouger les bourses, classées par thème — 100% gratuit, sans clé API (Yahoo Finance + Google News).
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-card-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5 mb-5">
        {themes.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTheme(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeTheme === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-card-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="w-px h-4 bg-card-border mx-1" />
        <button
          onClick={() => setShowPinnedOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            showPinnedOnly
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-card-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Pin className="w-3 h-3" />
          Épinglés ({pinned.length})
        </button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-card border border-card-border rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div className="bg-card border border-card-border rounded-xl p-6 text-sm text-muted-foreground space-y-1">
          <p>Impossible de charger le journal pour l'instant.</p>
          <p className="text-xs font-mono opacity-70 break-all">
            {(error as any)?.status ? `Statut ${(error as any).status} — ` : ""}
            {(error as any)?.message ?? String(error)}
          </p>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="bg-card border border-card-border rounded-xl p-6 text-sm text-muted-foreground space-y-1">
          <p>{showPinnedOnly ? "Aucune actualité épinglée pour l'instant." : "Aucune actualité disponible pour ce thème."}</p>
          {!showPinnedOnly && news.length === 0 && (
            <p className="text-xs opacity-70">
              Le serveur a répondu, mais aucune source (Yahoo Finance / Google News) n'a retourné d'article — regarde les logs du serveur API pour la raison exacte.
            </p>
          )}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => (
            <NewsCard key={item.id} item={item} pinned={pinned.includes(item.id)} onTogglePin={togglePin} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70 mt-4">
        Sentiment estimé automatiquement par mots-clés (pas d'analyse IA propriétaire) — à valider par ta propre lecture.
      </p>
    </div>
  );
}
