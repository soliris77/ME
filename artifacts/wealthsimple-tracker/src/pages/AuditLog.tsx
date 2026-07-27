import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ScrollText, ShieldOff, ShieldCheck, Settings2, Building2, RefreshCw, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AuditEntry {
  id: number;
  action: string;
  summary: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

function useAuditLog() {
  return useQuery<AuditEntry[]>({
    queryKey: ["audit-log"],
    queryFn: () => fetch(`${BASE}/api/audit?limit=200`).then((r) => r.json()),
    refetchInterval: 60_000,
  });
}

function iconFor(action: string) {
  if (action.startsWith("kill_switch.enable")) return <ShieldOff className="w-4 h-4 text-destructive" />;
  if (action.startsWith("kill_switch.disable")) return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
  if (action.startsWith("settings.")) return <Settings2 className="w-4 h-4 text-primary" />;
  if (action.startsWith("broker.")) return <Building2 className="w-4 h-4 text-muted-foreground" />;
  return <ScrollText className="w-4 h-4 text-muted-foreground" />;
}

export default function AuditLogPage() {
  usePageMeta("Journal d'audit — Soliris Market", "Historique des actions sensibles : seuils, kill-switch, courtier.");
  const auditQ = useAuditLog();
  const entries = auditQ.data ?? [];

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto animate-fadeUp">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="section-rule mb-4"><span>JOURNAL D'AUDIT</span></div>
          <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
            <ScrollText className="w-5 h-5 text-primary" />
            Journal d'audit
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Trace en lecture seule de toute action sensible : modification des seuils de risque,
            kill-switch, connexion et synchronisation du courtier.
          </p>
        </div>
        <button
          onClick={() => auditQ.refetch()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-input hover:bg-muted transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${auditQ.isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {auditQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-card-border rounded-xl p-8 text-center">
          Aucune action sensible n'a encore été enregistrée.
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl divide-y divide-border">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 px-5 py-4">
              <div className="mt-0.5 shrink-0">{iconFor(entry.action)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{entry.summary}</p>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">
                    {new Date(entry.createdAt).toLocaleString("fr-CA")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{entry.action}</p>
                {entry.details && Object.keys(entry.details).length > 0 && (
                  <pre className="mt-2 text-xs bg-background border border-border rounded-md p-2.5 overflow-x-auto text-muted-foreground">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
