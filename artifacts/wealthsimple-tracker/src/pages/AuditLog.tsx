import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ScrollText, ShieldOff, ShieldCheck, Settings2, Building2, RefreshCw, Loader2, ArrowRight } from "lucide-react";

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

const FIELD_LABELS: Record<string, string> = {
  mode: "Mode",
  maxOrderValue: "Valeur max. par ordre",
  maxPortfolioExposure: "Exposition max. portefeuille",
  largeOrderFrictionPct: "Seuil confirmation renforcée",
  email: "Courriel",
  phone: "Téléphone",
  killSwitchChannel: "Canal — kill-switch",
  largeOrderChannel: "Canal — gros ordres",
  priceAlertChannel: "Canal — alertes prix",
  patternAlertChannel: "Canal — signaux techniques",
  thresholdChangeChannel: "Canal — changements de seuils",
};

function fmtValue(key: string, val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (key === "largeOrderFrictionPct") return `${Math.round(Number(val) * 100)} %`;
  if (key === "maxOrderValue" || key === "maxPortfolioExposure") return `${Number(val).toLocaleString("fr-CA")} $`;
  if (typeof val === "boolean") return val ? "Oui" : "Non";
  return String(val);
}

function DetailsRenderer({ action, details }: { action: string; details: Record<string, unknown> }) {
  const keys = Object.keys(details);
  if (keys.length === 0) return null;

  // Changements avant/après (settings, notifications)
  if ("before" in details && "after" in details) {
    const before = details.before as Record<string, unknown>;
    const after  = details.after  as Record<string, unknown>;
    const changed = Object.keys(after).filter(
      (k) => k !== "updatedAt" && JSON.stringify(after[k]) !== JSON.stringify(before[k])
    );
    if (changed.length === 0) return null;
    return (
      <div className="mt-2 space-y-1">
        {changed.map((k) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground/80">{FIELD_LABELS[k] ?? k}</span>
            <span>{fmtValue(k, before[k])}</span>
            <ArrowRight className="w-3 h-3 shrink-0" />
            <span className="font-medium text-foreground">{fmtValue(k, after[k])}</span>
          </div>
        ))}
      </div>
    );
  }

  // Changements directs from/to par champ (ex. settings.update)
  const fromToKeys = keys.filter(
    (k) => typeof details[k] === "object" && details[k] !== null &&
           "from" in (details[k] as object) && "to" in (details[k] as object)
  );
  if (fromToKeys.length > 0) {
    return (
      <div className="mt-2 space-y-1">
        {fromToKeys.map((k) => {
          const d = details[k] as { from: unknown; to: unknown };
          return (
            <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground/80">{FIELD_LABELS[k] ?? k}</span>
              <span>{fmtValue(k, d.from)}</span>
              <ArrowRight className="w-3 h-3 shrink-0" />
              <span className="font-medium text-foreground">{fmtValue(k, d.to)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Paires clé/valeur simples (ex. trading_mode.change, broker.*)
  // Exclure les champs trop verbeux (objets imbriqués complexes)
  const simple = keys.filter((k) => {
    const v = details[k];
    return v === null || typeof v !== "object" || Array.isArray(v);
  });
  if (simple.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {simple.map((k) => (
        <span key={k} className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{FIELD_LABELS[k] ?? k} : </span>
          {fmtValue(k, details[k])}
        </span>
      ))}
    </div>
  );
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
                  <DetailsRenderer action={entry.action} details={entry.details} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
