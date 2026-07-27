import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { Loader2, Radio, AlertTriangle } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { useGetWatchlist, useGetQuoteHistory } from "@workspace/api-client-react";
import { GLOSSAIRE, GLOSSARY_MISTAKES } from "@/data/learnContent";
import { usePageMeta } from "@/hooks/use-page-meta";
import NotFound from "@/pages/not-found";
import { computeIndicators, computeOBV, computeMomentum, detectDivergences, type IndicatorPoint, type Divergence, type OHLCPoint } from "@/lib/indicators";

// Termes du glossaire qui correspondent à des indicateurs numériques calculés
// en direct — pour ceux-là, on affiche la valeur actuelle plutôt que juste
// la définition théorique.
const LIVE_INDICATOR_SLUGS = new Set(["rsi", "macd", "atr", "bandes-de-bollinger", "volume-on-balance-obv", "momentum-def", "divergence"]);

function LiveIndicatorValue({
  slug, last, obvSeries, momentum, divergences,
}: {
  slug: string;
  last: IndicatorPoint;
  obvSeries: number[];
  momentum: number | undefined;
  divergences: Divergence[];
}) {
  switch (slug) {
    case "rsi": {
      if (last.rsi === undefined) return <p className="text-xs text-muted-foreground">Pas assez de données.</p>;
      const zone = last.rsi < 30 ? "Survente — rebond possible" : last.rsi > 70 ? "Surachat — repli possible" : "Zone neutre";
      const cls = last.rsi < 30 ? "gain" : last.rsi > 70 ? "loss" : "";
      return (
        <div>
          <div className={`text-2xl font-mono font-bold ${cls}`}>{last.rsi.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground mt-1">{zone}</div>
        </div>
      );
    }
    case "macd": {
      if (last.macdLine === undefined || last.macdSignal === undefined) return <p className="text-xs text-muted-foreground">Pas assez de données.</p>;
      const bullish = last.macdLine > last.macdSignal;
      return (
        <div>
          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div><div className="text-muted-foreground mb-0.5">MACD</div><div className="font-bold text-sm">{last.macdLine.toFixed(3)}</div></div>
            <div><div className="text-muted-foreground mb-0.5">Signal</div><div className="font-bold text-sm">{last.macdSignal.toFixed(3)}</div></div>
            <div><div className="text-muted-foreground mb-0.5">Histogramme</div><div className={`font-bold text-sm ${last.macdHist !== undefined ? (last.macdHist >= 0 ? "gain" : "loss") : ""}`}>{last.macdHist?.toFixed(3) ?? "—"}</div></div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">{bullish ? "MACD au-dessus du signal — momentum haussier" : "MACD sous le signal — momentum baissier"}</div>
        </div>
      );
    }
    case "atr": {
      if (last.atr === undefined) return <p className="text-xs text-muted-foreground">Pas assez de données.</p>;
      const pct = last.close ? (last.atr / last.close) * 100 : undefined;
      return (
        <div>
          <div className="text-2xl font-mono font-bold">{last.atr.toFixed(2)} $</div>
          <div className="text-xs text-muted-foreground mt-1">{pct !== undefined ? `${pct.toFixed(2)}% du prix actuel — volatilité ${pct < 1.5 ? "faible" : pct < 3 ? "modérée" : "élevée"}` : ""}</div>
        </div>
      );
    }
    case "bandes-de-bollinger": {
      if (last.bbUpper === undefined) return <p className="text-xs text-muted-foreground">Pas assez de données.</p>;
      return (
        <div className="grid grid-cols-3 gap-3 text-xs font-mono">
          <div><div className="text-muted-foreground mb-0.5">Basse</div><div className="font-bold text-sm loss">{last.bbLower?.toFixed(2)} $</div></div>
          <div><div className="text-muted-foreground mb-0.5">Moyenne</div><div className="font-bold text-sm">{last.bbMiddle?.toFixed(2)} $</div></div>
          <div><div className="text-muted-foreground mb-0.5">Haute</div><div className="font-bold text-sm gain">{last.bbUpper?.toFixed(2)} $</div></div>
        </div>
      );
    }
    case "volume-on-balance-obv": {
      const v = obvSeries[obvSeries.length - 1];
      const prev = obvSeries[Math.max(0, obvSeries.length - 11)];
      if (v === undefined) return <p className="text-xs text-muted-foreground">Pas assez de données.</p>;
      const rising = v > prev;
      return (
        <div>
          <div className="text-2xl font-mono font-bold">{Math.round(v).toLocaleString("fr-CA")}</div>
          <div className={`text-xs mt-1 ${rising ? "gain" : "loss"}`}>{rising ? "En hausse sur 10 séances — hausse confirmée par le volume" : "En baisse sur 10 séances"}</div>
        </div>
      );
    }
    case "momentum-def": {
      if (momentum === undefined) return <p className="text-xs text-muted-foreground">Pas assez de données.</p>;
      return (
        <div>
          <div className={`text-2xl font-mono font-bold ${momentum >= 0 ? "gain" : "loss"}`}>{momentum >= 0 ? "+" : ""}{momentum.toFixed(2)}%</div>
          <div className="text-xs text-muted-foreground mt-1">Variation du prix sur les 10 dernières séances</div>
        </div>
      );
    }
    case "divergence": {
      if (divergences.length === 0) return <p className="text-xs text-muted-foreground">Aucune divergence active actuellement.</p>;
      const d = divergences[divergences.length - 1];
      return (
        <div>
          <div className={`text-sm font-semibold ${d.type === "haussière" ? "gain" : "loss"}`}>Divergence {d.type} ({d.indicator})</div>
          <p className="text-xs text-muted-foreground mt-1">{d.description}</p>
        </div>
      );
    }
    default:
      return null;
  }
}

export default function GlossaryDetail() {
  const params = useParams<{ slug: string }>();
  const term = GLOSSAIRE.find((g) => g.slug === params?.slug);
  const isLiveIndicator = term ? LIVE_INDICATOR_SLUGS.has(term.slug) : false;

  const { data: watchlist = [] } = useGetWatchlist();
  const liveSymbol = watchlist[0]?.symbol ?? "AAPL";
  const { data: rawHistory = [], isLoading: histLoading, dataUpdatedAt } = useGetQuoteHistory(liveSymbol, "3mo", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: isLiveIndicator } as any,
  });
  const history = rawHistory as unknown as OHLCPoint[];

  const indicatorData = useMemo(() => (history.length ? computeIndicators(history) : []), [history]);
  const last = indicatorData[indicatorData.length - 1];
  const obvSeries = useMemo(() => (history.length ? computeOBV(history) : []), [history]);
  const momentum = useMemo(() => (history.length ? computeMomentum(history, 10) : undefined), [history]);
  const divergences = useMemo(() => (indicatorData.length ? detectDivergences(indicatorData) : []), [indicatorData]);

  usePageMeta(
    term ? `${term.term} : définition | Glossaire trading Soliris Market` : "Terme introuvable | Soliris Market",
    term ? term.definition : "Ce terme n'existe pas dans le glossaire.",
  );

  if (!term) return <NotFound />;

  const related = GLOSSAIRE.filter((g) => g.category === term.category && g.slug !== term.slug).slice(0, 5);

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/apprendre/glossaire" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour au glossaire
      </Link>

      <div className="border border-card-border bg-card rounded-2xl p-6">
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">{term.category}</span>
        <h1 className="text-xl font-bold mt-2 mb-3">{term.term}</h1>
        <p className="text-sm text-foreground/80 leading-relaxed">{term.definition}</p>
      </div>

      {isLiveIndicator && (
        <div className="mt-6 bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-3.5 h-3.5 text-primary live-dot" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valeur en direct — {liveSymbol}</p>
          </div>
          {histLoading || !last ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement de la valeur en direct…
            </div>
          ) : (
            <LiveIndicatorValue slug={term.slug} last={last} obvSeries={obvSeries} momentum={momentum} divergences={divergences} />
          )}
          {!histLoading && last && (
            <p className="text-[10px] text-muted-foreground/60 mt-3">
              Mis à jour {new Date(dataUpdatedAt).toLocaleTimeString("fr-CA")}
              {" · "}
              {watchlist[0] ? "basé sur le 1er titre de votre liste de suivi" : "titre par défaut — ajoutez des actifs à votre liste de suivi pour personnaliser"}
            </p>
          )}
        </div>
      )}

      {GLOSSARY_MISTAKES[term.slug]?.length > 0 && (
        <div className="mt-6 border border-red-500/20 bg-red-500/5 rounded-xl p-4">
          <p className="text-sm font-semibold loss mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Erreurs fréquentes</p>
          <ul className="space-y-1.5">
            {GLOSSARY_MISTAKES[term.slug].map((m, i) => (
              <li key={i} className="text-xs text-foreground/80 leading-relaxed flex gap-1.5">
                <span className="loss shrink-0">•</span>{m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Termes liés — {term.category}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {related.map((g) => (
              <Link
                key={g.slug}
                href={`/apprendre/glossaire/${g.slug}`}
                className="text-sm px-3 py-2 border border-border rounded-lg hover:border-primary/40 hover:bg-muted/30 transition-colors"
              >
                {g.term}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
