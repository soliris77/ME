import { useEffect, useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useGetWatchlist, recordPracticeEvent } from "@workspace/api-client-react";
import { Grid3x3, Loader2, Info } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface HistoryPoint {
  date: string;
  close: number;
}

async function fetchHistory(symbol: string): Promise<HistoryPoint[]> {
  const res = await fetch(`${BASE}/api/quotes/${encodeURIComponent(symbol)}/history/3mo`);
  if (!res.ok) throw new Error(`Failed to fetch history for ${symbol}`);
  return res.json();
}

function dailyReturns(hist: HistoryPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < hist.length; i++) {
    if (hist[i - 1].close > 0) returns.push((hist[i].close - hist[i - 1].close) / hist[i - 1].close);
  }
  return returns;
}

// Corrélation de Pearson entre deux séries de rendements quotidiens (tronquées
// à la même longueur — les jours de bourse peuvent différer légèrement entre
// marchés/devises).
function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return null;
  return num / denom;
}

function colorFor(v: number | null): string {
  if (v === null) return "hsl(var(--muted))";
  // -1 (rouge) -> 0 (neutre) -> +1 (or/vert)
  if (v >= 0) {
    const alpha = 0.12 + v * 0.55;
    return `hsl(45, 65%, 50%, ${alpha})`;
  }
  const alpha = 0.12 + Math.abs(v) * 0.55;
  return `hsl(0, 70%, 55%, ${alpha})`;
}

export default function Correlation() {
  usePageMeta("Corrélation entre actifs — Soliris Market", "Matrice de corrélation des rendements quotidiens pour repérer le risque de concentration.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: watchlist = [], isLoading: wlLoading } = useGetWatchlist({ query: {} as any });
  const symbols = useMemo(() => watchlist.map((w) => w.symbol).slice(0, 12), [watchlist]);

  const queries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["correlation-history", s],
      queryFn: () => fetchHistory(s),
      enabled: symbols.length > 0,
    })),
  });

  const loading = wlLoading || queries.some((q) => q.isLoading);

  const matrix = useMemo(() => {
    if (queries.some((q) => !q.data)) return null;
    const returns = queries.map((q) => dailyReturns((q.data ?? []) as HistoryPoint[]));
    return symbols.map((_, i) => symbols.map((_, j) => (i === j ? 1 : pearson(returns[i], returns[j]))));
  }, [queries, symbols]);

  // Exercice pratique du parcours guidé : une matrice réellement calculée sur
  // au moins 2 titres compte comme pratique — un seul événement par visite.
  const sentPracticeEvent = useRef(false);
  useEffect(() => {
    if (matrix && symbols.length >= 2 && !sentPracticeEvent.current) {
      sentPracticeEvent.current = true;
      recordPracticeEvent({ tool: "correlation" }).catch(() => {});
    }
  }, [matrix, symbols.length]);

  const highPairs = useMemo(() => {
    if (!matrix) return [];
    const pairs: { a: string; b: string; v: number }[] = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const v = matrix[i][j];
        if (v !== null && v >= 0.75) pairs.push({ a: symbols[i], b: symbols[j], v });
      }
    }
    return pairs.sort((a, b) => b.v - a.v);
  }, [matrix, symbols]);

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-fadeUp">
      <div className="mb-6">
        <div className="section-rule mb-4"><span>RISQUE</span></div>
        <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <Grid3x3 className="w-5 h-5 text-primary" />
          Corrélation entre actifs
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Corrélation de Pearson des rendements quotidiens (90 derniers jours) entre les actifs
          de votre liste de suivi — une valeur proche de +1 signale un risque de concentration
          (les titres bougent ensemble), proche de -1 une diversification naturelle.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Calcul en cours…
        </div>
      ) : symbols.length < 2 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-card-border rounded-xl p-8 text-center">
          Ajoutez au moins deux actifs à votre liste de suivi pour calculer une matrice de corrélation.
        </div>
      ) : !matrix ? (
        <div className="text-sm text-destructive">Impossible de calculer la corrélation (données insuffisantes).</div>
      ) : (
        <>
          {highPairs.length > 0 && (
            <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4 mb-5 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Concentration détectée : </span>
                {highPairs.slice(0, 3).map((p, i) => (
                  <span key={`${p.a}-${p.b}`}>
                    {i > 0 && ", "}
                    {p.a} / {p.b} ({(p.v * 100).toFixed(0)}%)
                  </span>
                ))}
                {" "}bougent fortement ensemble — envisagez de diversifier.
              </div>
            </div>
          )}

          <div className="bg-card border border-card-border rounded-2xl p-5 overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="p-1.5" />
                  {symbols.map((s) => (
                    <th key={s} className="p-1.5 text-[10px] font-mono font-semibold text-muted-foreground -rotate-45 origin-bottom-left h-16 whitespace-nowrap align-bottom">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbols.map((rowSym, i) => (
                  <tr key={rowSym}>
                    <td className="p-1.5 text-[11px] font-mono font-semibold text-right pr-2 whitespace-nowrap">{rowSym}</td>
                    {symbols.map((colSym, j) => {
                      const v = matrix[i][j];
                      return (
                        <td key={colSym} className="p-0">
                          <div
                            className="w-11 h-11 flex items-center justify-center text-[10px] font-mono"
                            style={{ background: colorFor(v) }}
                            title={`${rowSym} vs ${colSym} : ${v === null ? "données insuffisantes" : v.toFixed(2)}`}
                          >
                            {v === null ? "—" : v.toFixed(2)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground/50 mt-3">
            Basé sur le prix uniquement (pas de classification sectorielle) — une corrélation élevée
            peut aussi refléter une exposition commune au marché global plutôt qu'un même secteur.
          </p>
        </>
      )}
    </div>
  );
}
