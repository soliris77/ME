import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Clock3, Gauge, Minus, Radar, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import type { Quote } from "@workspace/api-client-react";
import { formatPercent, formatPrice, formatVolume } from "@/lib/format";
import { Sparkline } from "@/components/Sparkline";

type MarketPulseProps = {
  indices: Quote[];
  topGainers: Quote[];
  topLosers: Quote[];
  isLoading: boolean;
  dataUpdatedAt: number;
  secondsSince: number;
  isFetching: boolean;
};

function PulseSkeleton() {
  return (
    <section className="market-pulse market-pulse-skeleton" aria-label="Market Pulse — chargement">
      <div className="market-pulse-skeleton-main">
        <div className="h-3 w-28 rounded bg-muted/55" />
        <div className="mt-4 h-8 w-64 rounded bg-muted/45" />
        <div className="mt-3 h-3 w-80 max-w-full rounded bg-muted/35" />
        <div className="mt-8 h-2 w-full rounded-full bg-muted/35" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-16 rounded-lg bg-muted/25" />
          ))}
        </div>
      </div>
      <div className="market-pulse-skeleton-moves">
        <div className="h-3 w-32 rounded bg-muted/45" />
        {[1, 2, 3].map((item) => (
          <div key={item} className="mt-4 h-12 rounded-lg bg-muted/25" />
        ))}
      </div>
    </section>
  );
}

function PulseMove({ quote, direction }: { quote: Quote; direction: "up" | "down" }) {
  const positive = direction === "up";
  return (
    <Link
      href={`/quote/${encodeURIComponent(quote.symbol)}`}
      className="market-pulse-move group"
      data-cursor-card
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`market-pulse-move-icon ${positive ? "market-pulse-move-icon-up" : "market-pulse-move-icon-down"}`}>
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          </span>
          <span className="truncate text-[11px] font-semibold text-foreground transition-colors group-hover:text-primary">
            {quote.name || quote.symbol}
          </span>
        </div>
        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {quote.symbol} · {formatPrice(quote.price, quote.currency)}
        </span>
      </div>
      <div className={`shrink-0 text-right font-mono text-[12px] font-semibold ${positive ? "gain" : "loss"}`}>
        <div>{formatPercent(quote.changePercent)}</div>
        <Sparkline symbol={quote.symbol} width={58} height={18} />
      </div>
    </Link>
  );
}

function PulseMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="market-pulse-metric">
      <span className="market-pulse-metric-label">{label}</span>
      <span className={`market-pulse-metric-value market-pulse-metric-${tone}`}>{value}</span>
      <span className="market-pulse-metric-detail">{detail}</span>
    </div>
  );
}

export default function MarketPulse({
  indices,
  topGainers,
  topLosers,
  isLoading,
  dataUpdatedAt,
  secondsSince,
  isFetching,
}: MarketPulseProps) {
  if (isLoading) return <PulseSkeleton />;

  const validIndices = indices.filter((quote) => Number.isFinite(quote.changePercent));
  const rising = validIndices.filter((quote) => quote.changePercent > 0).length;
  const falling = validIndices.filter((quote) => quote.changePercent < 0).length;
  const unchanged = validIndices.filter((quote) => quote.changePercent === 0).length;
  const averageChange =
    validIndices.length > 0
      ? validIndices.reduce((total, quote) => total + quote.changePercent, 0) / validIndices.length
      : null;
  const volumeValues = indices
    .map((quote) => quote.volume)
    .filter((volume): volume is number => typeof volume === "number" && Number.isFinite(volume));
  const aggregateVolume = volumeValues.length > 0
    ? volumeValues.reduce((total, volume) => total + volume, 0)
    : null;
  const hasData = validIndices.length > 0;
  const trendTone = averageChange == null ? "neutral" : averageChange > 0 ? "positive" : averageChange < 0 ? "negative" : "neutral";
  const trendLabel = averageChange == null
    ? "Lecture en attente"
    : averageChange > 0.15
      ? "Biais haussier"
      : averageChange < -0.15
        ? "Biais baissier"
        : "Marché partagé";
  const breadthTotal = validIndices.length || 1;
  const updatedLabel = dataUpdatedAt
    ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(dataUpdatedAt))
    : "—";
  const positiveMoves = topGainers.filter((quote) => Number.isFinite(quote.changePercent)).slice(0, 2);
  const negativeMoves = topLosers.filter((quote) => Number.isFinite(quote.changePercent)).slice(0, 2);
  const primaryMoves = [...positiveMoves, ...negativeMoves].slice(0, 4);

  return (
    <section className="market-pulse" aria-labelledby="market-pulse-title">
      <div className="market-pulse-main">
        <div className="market-pulse-header">
          <div>
            <div className="market-pulse-eyebrow">
              <Radar className="h-3.5 w-3.5" />
              Market Pulse
            </div>
            <h2 id="market-pulse-title" className="market-pulse-title">Marché en direct</h2>
            <p className="market-pulse-subtitle">État actuel des indices disponibles dans le flux de marché.</p>
          </div>
          <div className="market-pulse-live">
            <span className={`market-pulse-live-dot ${isFetching ? "market-pulse-live-dot-fetching" : ""}`} />
            <span>{isFetching ? "Mise à jour" : `Actualisé ${updatedLabel}`}</span>
            <span className="text-muted-foreground/50">· {secondsSince < 10 ? "< 10 s" : `${secondsSince} s`}</span>
          </div>
        </div>

        <div className="market-pulse-trend">
          <div className="market-pulse-trend-heading">
            <div>
              <span className="market-pulse-kicker">Tendance observée</span>
              <div className={`market-pulse-trend-label market-pulse-trend-${trendTone}`}>
                {trendTone === "positive" ? <TrendingUp className="h-4 w-4" /> : trendTone === "negative" ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                {trendLabel}
              </div>
            </div>
            <div className={`market-pulse-average market-pulse-trend-${trendTone}`}>
              {averageChange == null ? "—" : formatPercent(averageChange)}
              <span>variation moyenne des indices disponibles</span>
            </div>
          </div>

          <div
            className="market-pulse-breadth"
            role="img"
            aria-label={hasData ? `${rising} indices en hausse, ${falling} en baisse et ${unchanged} inchangés` : "Répartition des indices indisponible"}
          >
            <span className="market-pulse-breadth-negative" style={{ width: `${(falling / breadthTotal) * 100}%` }} />
            <span className="market-pulse-breadth-flat" style={{ width: `${(unchanged / breadthTotal) * 100}%` }} />
            <span className="market-pulse-breadth-positive" style={{ width: `${(rising / breadthTotal) * 100}%` }} />
          </div>
          <div className="market-pulse-breadth-labels">
            <span><i className="market-pulse-legend-dot market-pulse-legend-negative" /> {falling} baisse{falling > 1 ? "s" : ""}</span>
            <span>{validIndices.length} indices lus</span>
            <span><i className="market-pulse-legend-dot market-pulse-legend-positive" /> {rising} hausse{rising > 1 ? "s" : ""}</span>
          </div>
        </div>

        <div className="market-pulse-metrics">
          <PulseMetric
            label="En hausse"
            value={hasData ? `${rising}` : "—"}
            detail={hasData ? `sur ${validIndices.length} indices` : "Donnée indisponible"}
            tone="positive"
          />
          <PulseMetric
            label="En baisse"
            value={hasData ? `${falling}` : "—"}
            detail={hasData ? `sur ${validIndices.length} indices` : "Donnée indisponible"}
            tone="negative"
          />
          <PulseMetric
            label="Activité"
            value={aggregateVolume == null ? "—" : formatVolume(aggregateVolume)}
            detail={aggregateVolume == null ? "volume non fourni" : "volume agrégé des indices"}
          />
          <PulseMetric
            label="Volatilité"
            value="—"
            detail="non disponible dans ce flux"
          />
        </div>

        <div className="market-pulse-footer">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary/75" />
            <span>Lecture descriptive, sans score synthétique</span>
          </div>
          <Link href="/observatoire" className="market-pulse-observatory-link">
            Explorer dans l’Observatoire
            <Clock3 className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <aside className="market-pulse-moves" aria-labelledby="market-pulse-moves-title">
        <div className="market-pulse-moves-header">
          <div>
            <span className="market-pulse-kicker">À surveiller</span>
            <h3 id="market-pulse-moves-title">Principaux mouvements</h3>
          </div>
          <BarChart3 className="h-4 w-4 text-primary/65" />
        </div>
        {primaryMoves.length > 0 ? (
          <div className="market-pulse-moves-list">
            {primaryMoves.map((quote) => (
              <PulseMove key={quote.symbol} quote={quote} direction={quote.changePercent >= 0 ? "up" : "down"} />
            ))}
          </div>
        ) : (
          <div className="market-pulse-empty">
            <Gauge className="h-4 w-4 text-muted-foreground/50" />
            <span>Les mouvements apparaîtront dès qu’une cotation valide sera disponible.</span>
          </div>
        )}
        <div className="market-pulse-moves-note">
          <span>Sources : indices et actifs populaires du flux marché</span>
          <Link href="/scanner" aria-label="Ouvrir le scanner et les signaux">
            Approfondir
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </aside>
    </section>
  );
}