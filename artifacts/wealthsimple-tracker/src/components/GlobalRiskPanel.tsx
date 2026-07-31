/**
 * Vue « risque global » — panneau lecture seule de la page Auto-Trader.
 * Affiche la perte totale si TOUS les stops actifs sautent (positions
 * auto-trader + ordres stop courtier), l'exposition par symbole/devise,
 * et une alerte visuelle si le risque dépasse la limite journalière.
 */
import { useQuery } from "@tanstack/react-query";
import { Scale, AlertTriangle, ShieldOff } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface StopPositionRisk {
  source: "auto_trader" | "stop_order";
  refId: number;
  symbol: string;
  quantity: number;
  entryPrice: number | null;
  currentPrice: number | null;
  stopPrice: number | null;
  riskAmount: number | null;
  marketValue: number | null;
  unprotected: boolean;
}

interface GlobalRiskData {
  mode: "paper" | "live";
  positions: StopPositionRisk[];
  totalRiskIfAllStopsHit: number;
  unprotectedCount: number;
  unprotectedValue: number;
  exposure: {
    total: number;
    bySymbol: { symbol: string; value: number; currency: string; pct: number }[];
    byCurrency: { currency: string; value: number; pct: number }[];
  };
  exposureSource: "broker" | "auto_trader";
  brokerFetchError: string | null;
  limits: { maxDailyLossAmount: number | null; maxPortfolioExposure: number };
  riskExceedsDailyLimit: boolean;
  exposureExceedsLimit: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GlobalRiskPanel() {
  const q = useQuery<GlobalRiskData>({
    queryKey: ["auto-trader-global-risk"],
    queryFn: () => fetch(`${BASE}/api/auto-trader/global-risk`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const data = q.data;
  if (!data || !Array.isArray(data.positions)) return null;

  const hasPositions = data.positions.length > 0;
  const hasExposure = data.exposure.total > 0;
  if (!hasPositions && !hasExposure) return null;

  const limit = data.limits.maxDailyLossAmount;
  const riskPct = limit !== null && limit > 0
    ? Math.min(100, (data.totalRiskIfAllStopsHit / limit) * 100)
    : null;
  const alertRisk = data.riskExceedsDailyLimit;
  const barColor = alertRisk ? "bg-red-500" : riskPct !== null && riskPct >= 60 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className={`mb-5 bg-card border rounded-xl p-4 ${alertRisk ? "border-red-500/40" : "border-border/50"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Risque global — si tous les stops sautent
          </span>
        </div>
        <span className={`text-[13px] font-mono font-bold sensitive ${alertRisk ? "text-red-400" : "text-foreground"}`}>
          −{fmt(data.totalRiskIfAllStopsHit)} $
        </span>
      </div>

      {/* Alerte : risque cumulé > limite de perte journalière */}
      {alertRisk && limit !== null && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-red-400 leading-relaxed">
            <strong>Le risque cumulé ({fmt(data.totalRiskIfAllStopsHit)} $) dépasse ta limite de perte
            journalière ({fmt(limit)} $).</strong> Si tous les stops sautent le même jour, le coupe-circuit
            se déclenchera après coup — réduis les positions ou ajuste la limite dans les{" "}
            <Link href="/parametres" className="underline font-semibold">Paramètres</Link>.
          </p>
        </div>
      )}

      {/* Jauge risque vs limite journalière */}
      {limit !== null && limit > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">Risque vs coupe-circuit ({fmt(limit)} $)</span>
            <span className={`text-[10px] font-mono ${alertRisk ? "text-red-400" : "text-muted-foreground"}`}>
              {riskPct !== null ? `${riskPct.toFixed(0)} %` : "—"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-border/40 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${riskPct ?? 0}%` }} />
          </div>
        </div>
      )}
      {limit === null && hasPositions && (
        <p className="mb-3 text-[10px] text-muted-foreground">
          Aucune limite de perte journalière configurée — règle le coupe-circuit dans les{" "}
          <Link href="/parametres" className="underline">Paramètres</Link> pour comparer.
        </p>
      )}

      {/* Positions non protégées */}
      {data.unprotectedCount > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/25 px-3 py-2">
          <ShieldOff className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-yellow-400 leading-relaxed">
            {data.unprotectedCount} position{data.unprotectedCount > 1 ? "s" : ""} sans stop actif
            (<span className="sensitive">{fmt(data.unprotectedValue)} $</span> de valeur non protégée) —
            perte potentielle non bornée, exclue du total ci-dessus.
          </p>
        </div>
      )}

      {/* Détail par position */}
      {hasPositions && (
        <div className="mb-3 space-y-1.5">
          {data.positions.map((p) => (
            <div key={`${p.source}-${p.refId}`} className="flex items-center justify-between gap-3 rounded-lg bg-background/50 px-3 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[12px] font-bold font-mono text-foreground">{p.symbol}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {p.quantity} × {p.currentPrice !== null ? `${p.currentPrice.toFixed(2)} $` : "…"}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-border/40 text-muted-foreground uppercase tracking-wide hidden sm:inline">
                  {p.source === "auto_trader" ? "auto-trader" : "ordre stop"}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] font-mono text-muted-foreground">
                  stop : {p.stopPrice !== null ? `${p.stopPrice.toFixed(2)} $` : "aucun"}
                </span>
                {p.unprotected ? (
                  <span className="text-[11px] font-mono text-yellow-400">non protégée</span>
                ) : (
                  <span className="text-[11px] font-mono font-semibold text-red-400 sensitive">
                    −{p.riskAmount !== null ? fmt(p.riskAmount) : "…"} $
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Exposition */}
      {hasExposure && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Exposition par titre
              </span>
              <span className="text-[10px] font-mono text-muted-foreground sensitive">{fmt(data.exposure.total)} $</span>
            </div>
            <div className="space-y-1">
              {data.exposure.bySymbol.slice(0, 8).map((s) => (
                <div key={s.symbol} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-foreground w-16 truncate">{s.symbol}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${s.pct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{s.pct.toFixed(0)} %</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
              Par devise
            </span>
            <div className="space-y-1">
              {data.exposure.byCurrency.map((c) => (
                <div key={c.currency} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-foreground w-16">{c.currency}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
                    <div className="h-full rounded-full bg-accent-foreground/60" style={{ width: `${c.pct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{c.pct.toFixed(0)} %</span>
                </div>
              ))}
            </div>
            {data.exposureExceedsLimit && (
              <p className="mt-2 text-[10px] text-yellow-400">
                Exposition totale au-dessus de la limite configurée ({fmt(data.limits.maxPortfolioExposure)} $).
              </p>
            )}
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[10px] text-muted-foreground/60">
        Mode {data.mode === "live" ? "réel" : "papier"} · exposition{" "}
        {data.exposureSource === "broker" ? "d'après les positions courtier" : "d'après les positions suivies par l'auto-trader"}
        {data.brokerFetchError ? " (courtier injoignable — repli interne)" : ""} · lecture seule.
      </p>
    </div>
  );
}
