/**
 * CopiedTradesTable — tableau historique des trades copiés/notifiés.
 * Réutilise le style des tableaux existants du projet.
 */
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, TrendingUp, TrendingDown } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CopiedTrade {
  id: number;
  followedTraderId: number;
  externalTradeId: string;
  symbol: string;
  direction: string;
  originalAmount: string | null;
  copiedAmount: string | null;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    notified: { label: "Notifié", cls: "bg-amber-400/15 text-amber-400" },
    executed: { label: "Exécuté", cls: "bg-emerald-500/15 text-emerald-400" },
    failed: { label: "Échoué", cls: "bg-red-500/15 text-red-400" },
    rejected: { label: "Rejeté", cls: "bg-red-500/15 text-red-400" },
    pending: { label: "En attente", cls: "bg-sidebar-accent text-muted-foreground" },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function CopiedTradesTable() {
  const tradesQ = useQuery<CopiedTrade[]>({
    queryKey: ["copied-trades"],
    queryFn: () => fetch(`${BASE}/api/copy-trading/copied-trades`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const trades = Array.isArray(tradesQ.data) ? tradesQ.data : [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Trades copiés</h2>
        {trades.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">({trades.length})</span>
        )}
      </div>

      {tradesQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      ) : trades.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">Aucun trade copié pour l'instant.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Les trades détectés chez les traders que tu suis apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Instrument
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Direction
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Volume original
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Copié ($)
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Détecté le
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {trades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-sidebar-accent/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-xs">
                      {trade.symbol}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          trade.direction === "buy" ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {trade.direction === "buy" ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {trade.direction === "buy" ? "Achat" : "Vente"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {trade.originalAmount != null ? `${trade.originalAmount} lots` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {trade.copiedAmount != null ? `$${trade.copiedAmount}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={trade.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(trade.createdAt).toLocaleString("fr-CA", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
