import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { ComposedChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useGetWatchlist } from "@workspace/api-client-react";
import { CANDLES, CANDLE_MISTAKES, CANDLE_RELATED_GLOSSARY, GLOSSAIRE } from "@/data/learnContent";
import { usePageMeta } from "@/hooks/use-page-meta";
import NotFound from "@/pages/not-found";
import { isIntradayHistory, formatCandleDate, type OHLCPoint } from "@workspace/indicators";
import { detectCandlePatterns } from "@/lib/indicators";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Correspondance entre le slug d'un pattern éditorial (learnContent.ts) et le
// `nameEn` retourné par le moteur de détection (indicators.ts) — sert à
// retrouver une vraie occurrence de CE pattern précis dans l'historique.
const PATTERN_NAME_EN: Record<string, string> = {
  "marteau-hammer": "Hammer",
  "etoile-filante-shooting-star": "Shooting Star",
  "doji": "Doji",
  "engulfing-haussier": "Bullish Engulfing",
  "engulfing-baissier": "Bearish Engulfing",
  "etoile-du-matin-morning-star": "Morning Star",
  "etoile-du-soir-evening-star": "Evening Star",
  "trois-soldats-blancs": "Three White Soldiers",
};

async function fetchHistory(symbol: string): Promise<OHLCPoint[]> {
  const res = await fetch(`${BASE}/api/quotes/${encodeURIComponent(symbol)}/history/6mo`);
  if (!res.ok) throw new Error(`Failed to fetch history for ${symbol}`);
  return res.json();
}

// Mini-graphique en chandeliers de la période autour d'une occurrence
// détectée — la bougie concernée est cerclée en violet, comme dans le
// module Analyse technique.
function PatternExampleChart({ history, idx }: { history: OHLCPoint[]; idx: number }) {
  const intraday = isIntradayHistory(history);
  const start = Math.max(0, idx - 6);
  const end = Math.min(history.length - 1, idx + 2);
  const chartData = history.slice(start, end + 1).map((p, i) => {
    const realIdx = start + i;
    const open = p.open ?? p.close;
    const low = p.low ?? p.close;
    const high = p.high ?? p.close;
    const rising = p.close >= open;
    return {
      date: formatCandleDate(p.date, intraday),
      isTarget: realIdx === idx,
      rising,
      wickRange: [low, high] as [number, number],
      bodyRange: [Math.min(open, p.close), Math.max(open, p.close)] as [number, number],
    };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={34} />
        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: 11 }} />
        <Bar dataKey="wickRange" barSize={2} isAnimationActive={false}>
          {chartData.map((d, i) => <Cell key={`w-${i}`} fill={d.rising ? "#22c55e" : "#ef4444"} />)}
        </Bar>
        <Bar dataKey="bodyRange" barSize={10} isAnimationActive={false}>
          {chartData.map((d, i) => (
            <Cell key={`b-${i}`} fill={d.rising ? "#22c55e" : "#ef4444"} stroke={d.isTarget ? "#a855f7" : "none"} strokeWidth={d.isTarget ? 2 : 0} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function CandleDetail() {
  const params = useParams<{ slug: string }>();
  const candle = CANDLES.find((c) => c.slug === params?.slug);
  const targetNameEn = candle ? PATTERN_NAME_EN[candle.slug] : undefined;

  const { data: watchlist = [], isLoading: wlLoading } = useGetWatchlist();
  const symbols = useMemo(() => watchlist.map((w) => w.symbol).slice(0, 15), [watchlist]);

  const queries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["pattern-example-history", s],
      queryFn: () => fetchHistory(s),
      enabled: symbols.length > 0 && !!targetNameEn,
    })),
  });

  const loadingExample = wlLoading || (!!targetNameEn && queries.some((q) => q.isLoading));

  const recentExample = useMemo<{ symbol: string; isoDate: string; idx: number; history: OHLCPoint[] } | null>(() => {
    if (!targetNameEn) return null;
    let best: { symbol: string; isoDate: string; idx: number; history: OHLCPoint[] } | null = null;
    symbols.forEach((symbol, i) => {
      const history = queries[i]?.data as OHLCPoint[] | undefined;
      if (!history || history.length === 0) return;
      const matches = detectCandlePatterns(history).filter((p) => p.nameEn === targetNameEn);
      if (matches.length === 0) return;
      const lastMatch = matches[matches.length - 1];
      const isoDate = history[lastMatch.idx]?.date;
      if (!isoDate) return;
      if (!best || new Date(isoDate).getTime() > new Date(best.isoDate).getTime()) {
        best = { symbol, isoDate, idx: lastMatch.idx, history };
      }
    });
    return best;
  }, [queries, symbols, targetNameEn]);

  usePageMeta(
    candle ? `${candle.name} : pattern chandelier ${candle.signal} expliqué | Soliris Market` : "Pattern introuvable | Soliris Market",
    candle ? candle.description : "Ce pattern de chandelier n'existe pas.",
  );

  if (!candle) return <NotFound />;

  const others = CANDLES.filter((c) => c.slug !== candle.slug).slice(0, 4);

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/apprendre/chandeliers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux chandeliers japonais
      </Link>

      <div className={`border rounded-2xl p-6 ${
        candle.signal === "haussier" ? "border-emerald-500/20 bg-emerald-500/5" :
        candle.signal === "baissier" ? "border-red-500/20 bg-red-500/5" :
        "border-border bg-muted/20"
      }`}>
        <div className="flex items-start gap-4">
          <div className="w-16 h-20 shrink-0 flex items-center justify-center bg-background/60 rounded-xl" dangerouslySetInnerHTML={{ __html: candle.svg }} />
          <div>
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
              candle.signal === "haussier" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
              candle.signal === "baissier" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
              "bg-muted text-muted-foreground"
            }`}>{candle.signal === "haussier" ? "🟢 Signal haussier" : candle.signal === "baissier" ? "🔴 Signal baissier" : "⚪ Neutre"}</span>
            <h1 className="text-xl font-bold mt-2">{candle.name}</h1>
          </div>
        </div>

        <p className="text-sm text-foreground/80 leading-relaxed mt-4">{candle.description}</p>

        <div className="bg-background/60 rounded-xl p-4 mt-4">
          <p className="text-sm font-semibold text-primary mb-1">💡 Comment l'utiliser en trading</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{candle.howToUse}</p>
        </div>

        <div className="bg-background/60 rounded-xl p-4 mt-4">
          <p className="text-sm font-semibold text-primary mb-2">🔍 Exemple récent</p>
          {loadingExample ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Recherche d'une occurrence récente dans votre liste de suivi…
            </div>
          ) : recentExample ? (
            <>
              <p className="text-xs text-foreground/80 mb-3">
                Détecté sur{" "}
                <Link href={`/quote/${encodeURIComponent(recentExample.symbol)}`} className="font-semibold text-primary hover:underline">
                  {recentExample.symbol}
                </Link>{" "}
                le {new Date(recentExample.isoDate).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}.
              </p>
              <div className="h-32 -mx-1">
                <PatternExampleChart history={recentExample.history} idx={recentExample.idx} />
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">La bougie cerclée en violet est l'occurrence détectée.</p>
            </>
          ) : symbols.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Ajoutez des actifs à votre liste de suivi pour voir de vraies occurrences de ce pattern.</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">Aucune occurrence récente détectée — repassez plus tard.</p>
          )}
        </div>
      </div>

      {(CANDLE_MISTAKES[candle.slug]?.length || CANDLE_RELATED_GLOSSARY[candle.slug]?.length) ? (
        <div className="grid sm:grid-cols-2 gap-3 mt-6">
          {CANDLE_MISTAKES[candle.slug]?.length ? (
            <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4">
              <p className="text-sm font-semibold loss mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Erreurs fréquentes</p>
              <ul className="space-y-1.5">
                {CANDLE_MISTAKES[candle.slug].map((m, i) => (
                  <li key={i} className="text-xs text-foreground/80 leading-relaxed flex gap-1.5">
                    <span className="loss shrink-0">•</span>{m}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {CANDLE_RELATED_GLOSSARY[candle.slug]?.length ? (
            <div className="border border-border bg-muted/20 rounded-xl p-4">
              <p className="text-sm font-semibold text-primary mb-2">📖 Termes liés</p>
              <div className="flex flex-wrap gap-1.5">
                {CANDLE_RELATED_GLOSSARY[candle.slug].map((slug) => {
                  const term = GLOSSAIRE.find((g) => g.slug === slug);
                  if (!term) return null;
                  return (
                    <Link
                      key={slug}
                      href={`/apprendre/glossaire/${slug}`}
                      className="text-xs px-2.5 py-1 rounded-full bg-background border border-border hover:border-primary/40 transition-colors"
                    >
                      {term.term}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Autres patterns à connaître</h2>
        <div className="grid grid-cols-2 gap-2">
          {others.map((c) => (
            <Link
              key={c.slug}
              href={`/apprendre/chandeliers/${c.slug}`}
              className="text-sm px-3 py-2 border border-border rounded-lg hover:border-primary/40 hover:bg-muted/30 transition-colors"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
