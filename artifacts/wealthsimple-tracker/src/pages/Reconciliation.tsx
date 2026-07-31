import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Scale, CheckCircle2, AlertTriangle, RefreshCw, Loader2, Info } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ReconciliationRow {
  symbol: string;
  brokerUnits: number;
  internalUnits: number;
  diff: number;
  matches: boolean;
  currency: string | null;
}

interface ReconciliationResult {
  mode: "paper" | "live";
  brokerConnected: boolean;
  brokerFetchError: string | null;
  checkedAt: string;
  rows: ReconciliationRow[];
  mismatchCount: number;
}

function useReconciliation() {
  return useQuery<ReconciliationResult>({
    queryKey: ["broker-reconciliation"],
    queryFn: () => fetch(`${BASE}/api/broker/reconciliation`).then((r) => r.json()),
    refetchInterval: 60_000,
  });
}

function fmtUnits(n: number): string {
  return n.toLocaleString("fr-CA", { maximumFractionDigits: 4 });
}

export default function ReconciliationPage() {
  usePageMeta("Réconciliation — Soliris Market", "Comparaison des positions courtier vs. historique interne des ordres.");
  const q = useReconciliation();
  const data = q.data;

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto animate-fadeUp">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="section-rule mb-4"><span>RÉCONCILIATION</span></div>
          <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
            <Scale className="w-5 h-5 text-primary" />
            Réconciliation des positions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Compare les positions détenues chez le courtier aux positions calculées à partir de
            l'historique interne des ordres. Un écart signale un trade fait hors Soliris Market
            (directement dans l'app Wealthsimple) ou un problème de synchronisation — à vérifier
            manuellement, rien n'est corrigé automatiquement.
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
        <div className="text-sm text-destructive">Impossible de charger la réconciliation.</div>
      ) : (
        <>
          {data.mode === "paper" && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm mb-5 bg-primary/8 border border-primary/25 text-primary">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              Mode paper — comparaison basée uniquement sur l'historique interne (aucune position réelle chez le courtier).
            </div>
          )}
          {data.brokerFetchError && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm mb-5 bg-destructive/10 border border-destructive/25 text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Échec de récupération des positions courtier : {data.brokerFetchError}
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            {data.mismatchCount === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500">
                <CheckCircle2 className="w-4 h-4" /> Aucun écart détecté
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-500">
                <AlertTriangle className="w-4 h-4" /> {data.mismatchCount} écart{data.mismatchCount > 1 ? "s" : ""} détecté{data.mismatchCount > 1 ? "s" : ""}
              </span>
            )}
            <span className="text-xs text-muted-foreground ml-auto font-mono">
              Vérifié à {new Date(data.checkedAt).toLocaleTimeString("fr-CA")}
            </span>
          </div>

          {data.rows.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed border-card-border rounded-xl p-8 text-center">
              Aucune position à comparer pour le moment.
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Symbole</th>
                    <th className="text-right px-4 py-2.5 font-medium">Courtier</th>
                    <th className="text-right px-4 py-2.5 font-medium">Interne</th>
                    <th className="text-right px-4 py-2.5 font-medium">Écart</th>
                    <th className="text-center px-4 py-2.5 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((row) => (
                    <tr key={row.symbol} className={row.matches ? "" : "bg-amber-500/5"}>
                      <td className="px-4 py-2.5 font-mono font-medium">{row.symbol}</td>
                      <td className="px-4 py-2.5 text-right font-mono sensitive">{fmtUnits(row.brokerUnits)}</td>
                      <td className="px-4 py-2.5 text-right font-mono sensitive">{fmtUnits(row.internalUnits)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono sensitive ${row.matches ? "text-muted-foreground" : "text-amber-500 font-semibold"}`}>
                        {row.diff > 0 ? "+" : ""}{fmtUnits(row.diff)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {row.matches ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500 inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
