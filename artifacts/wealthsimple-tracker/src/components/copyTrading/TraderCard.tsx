/**
 * TraderCard — Carte résumant un trader / une stratégie CopyFactory.
 * Utilisée dans la page de découverte et dans la liste des traders suivis.
 */
import { TrendingUp, TrendingDown, Users, BarChart2, Zap } from "lucide-react";

interface TraderCardProps {
  strategyId: string;
  displayName: string;
  description?: string | null;
  gainPct?: number | null;
  maxDrawdownPct?: number | null;
  totalTrades?: number | null;
  winRatePct?: number | null;
  subscribers?: number | null;
  // Compact mode : pour la liste des traders suivis (moins de détails)
  compact?: boolean;
  autoExecute?: boolean;
  maxAmountPerTrade?: string | null;
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-mono font-semibold mt-0.5 ${className}`}>{value}</span>
    </div>
  );
}

export default function TraderCard({
  strategyId,
  displayName,
  description,
  gainPct,
  maxDrawdownPct,
  totalTrades,
  winRatePct,
  subscribers,
  compact = false,
  autoExecute,
  maxAmountPerTrade,
}: TraderCardProps) {
  const gainPositive = gainPct !== null && gainPct !== undefined && gainPct >= 0;

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 h-full">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          {/* Avatar initiales */}
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{displayName}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
              {strategyId}
            </p>
          </div>
        </div>

        {/* Badge gain */}
        {gainPct !== null && gainPct !== undefined && (
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
              gainPositive
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {gainPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {gainPositive ? "+" : ""}
            {gainPct.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Description (mode non-compact) */}
      {!compact && description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{description}</p>
      )}

      {/* Statistiques */}
      {!compact && (
        <div className="grid grid-cols-3 gap-3 mb-3 pt-3 border-t border-card-border">
          <Stat
            label="Drawdown max"
            value={maxDrawdownPct != null ? `${maxDrawdownPct.toFixed(1)}%` : "—"}
            className={maxDrawdownPct != null && maxDrawdownPct > 20 ? "text-red-400" : ""}
          />
          <Stat
            label="Win rate"
            value={winRatePct != null ? `${winRatePct.toFixed(0)}%` : "—"}
            className={winRatePct != null && winRatePct >= 50 ? "text-emerald-400" : "text-red-400"}
          />
          <Stat
            label="Trades"
            value={totalTrades != null ? String(totalTrades) : "—"}
          />
        </div>
      )}

      {/* Abonnés + mode */}
      <div className="flex items-center justify-between">
        {subscribers != null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            {subscribers} abonné{subscribers > 1 ? "s" : ""}
          </div>
        )}

        {compact && autoExecute !== undefined && (
          <div
            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
              autoExecute
                ? "bg-amber-400/15 text-amber-400"
                : "bg-sidebar-accent text-muted-foreground"
            }`}
          >
            <Zap className="w-3 h-3" />
            {autoExecute ? "Auto" : "Notif. seul."}
          </div>
        )}

        {compact && maxAmountPerTrade && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <BarChart2 className="w-3 h-3" />
            Max {maxAmountPerTrade} $ / trade
          </div>
        )}
      </div>
    </div>
  );
}
