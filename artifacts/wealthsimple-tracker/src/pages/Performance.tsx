import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { formatPrice } from "@/lib/format";
import { LineChart, TrendingUp, TrendingDown, Loader2, RefreshCw, Layers } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PerformanceMetrics {
  mode: "paper" | "live" | "combined";
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  riskRewardRatio: number | null;
  totalPnl: number;
  maxDrawdown: number;
  openPositions: number;
}

interface PerformanceReport {
  paper: PerformanceMetrics;
  live: PerformanceMetrics;
  combined: PerformanceMetrics;
}

function usePerformance() {
  return useQuery<PerformanceReport>({
    queryKey: ["performance-report"],
    queryFn: () => fetch(`${BASE}/api/performance`).then((r) => r.json()),
    refetchInterval: 60_000,
  });
}

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function money(n: number | null): string {
  return n === null ? "—" : formatPrice(n);
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" | "neutral" }) {
  const toneClass = tone === "gain" ? "gain" : tone === "loss" ? "loss" : "text-foreground";
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-mono font-semibold mt-1.5 ${toneClass}`}>{value}</div>
    </div>
  );
}

function MetricsSection({ title, icon: Icon, metrics }: { title: string; icon: typeof TrendingUp; metrics: PerformanceMetrics }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-muted-foreground ml-1">
          {metrics.totalTrades} trade{metrics.totalTrades !== 1 ? "s" : ""} clôturé{metrics.totalTrades !== 1 ? "s" : ""}
          {metrics.openPositions > 0 && ` · ${metrics.openPositions} position${metrics.openPositions > 1 ? "s" : ""} ouverte${metrics.openPositions > 1 ? "s" : ""}`}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Taux de réussite" value={pct(metrics.winRate)} tone={metrics.winRate === null ? "neutral" : metrics.winRate >= 0.5 ? "gain" : "loss"} />
        <StatCard label="Gains / pertes" value={`${metrics.wins}G / ${metrics.losses}P`} />
        <StatCard label="Gain moyen" value={money(metrics.avgWin)} tone="gain" />
        <StatCard label="Perte moyenne" value={metrics.avgLoss === null ? "—" : `-${formatPrice(metrics.avgLoss)}`} tone="loss" />
        <StatCard
          label="Ratio risque/récompense"
          value={metrics.riskRewardRatio === null ? "—" : metrics.riskRewardRatio.toFixed(2)}
        />
        <StatCard
          label="P&L total"
          value={metrics.totalPnl >= 0 ? `+${formatPrice(metrics.totalPnl)}` : `-${formatPrice(Math.abs(metrics.totalPnl))}`}
          tone={metrics.totalPnl >= 0 ? "gain" : "loss"}
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">Drawdown maximal :</span>
        <span className="font-mono loss">-{formatPrice(metrics.maxDrawdown)}</span>
        <span className="opacity-60">(plus grande baisse observée depuis un sommet de P&L cumulé)</span>
      </div>
    </div>
  );
}

export default function Performance() {
  usePageMeta("Performance — Soliris Market", "Taux de réussite, risque/récompense et drawdown, paper vs. live.");
  const q = usePerformance();
  const data = q.data;

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto animate-fadeUp">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="section-rule mb-4"><span>PERFORMANCE</span></div>
          <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
            <LineChart className="w-5 h-5 text-primary" />
            Dashboard de performance
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Agrège l'historique des ordres remplis (appariement FIFO) en métriques de résultat —
            distinct du journal de trading brut. Comparez le mode paper et le mode live une fois
            qu'il y a assez de données des deux côtés.
          </p>
        </div>
        <button
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-input hover:bg-muted transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : !data ? (
        <div className="text-sm text-destructive">Impossible de charger les métriques de performance.</div>
      ) : data.combined.totalTrades === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-card-border rounded-xl p-8 text-center">
          Aucun trade clôturé pour le moment — les métriques apparaîtront après le premier aller-retour
          (achat puis vente) complété sur un titre.
        </div>
      ) : (
        <>
          <MetricsSection title="Combiné (paper + live)" icon={Layers} metrics={data.combined} />
          <MetricsSection title="Mode paper" icon={TrendingUp} metrics={data.paper} />
          <MetricsSection title="Mode live" icon={TrendingDown} metrics={data.live} />

          {data.paper.totalTrades > 0 && data.live.totalTrades > 0 && (
            <div className="bg-primary/8 border border-primary/25 rounded-xl p-4 text-sm text-primary">
              Comparaison directe : taux de réussite paper {pct(data.paper.winRate)} vs. live {pct(data.live.winRate)} ·
              ratio risque/récompense paper {data.paper.riskRewardRatio?.toFixed(2) ?? "—"} vs. live {data.live.riskRewardRatio?.toFixed(2) ?? "—"}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
