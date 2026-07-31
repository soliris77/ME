import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, XCircle, AlertTriangle } from "lucide-react";
import { formatPrice } from "@/lib/format";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface StopOrder {
  id: number;
  symbol: string;
  side: string;
  quantity: string;
  mode: "paper" | "live";
  status: string;
  expectedPrice: string | null;
  fillPrice: string | null;
  filledQuantity: string | null;
  errorMessage: string | null;
  submittedAt: string | null;
  createdAt: string;
  active: boolean;
}

interface StopOrdersResponse {
  mode: "paper" | "live";
  syncedFromBroker: boolean;
  syncError: string | null;
  orders: StopOrder[];
}

const SURFACE = "#131722";
const BORDER = "#232838";
const MUTED = "#8B92A5";
const ACCENT = "#D4A72C";
const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: "tabular-nums" };

const STATUS_BADGE: Record<string, { text: string; color: string; bg: string }> = {
  pending:          { text: "En attente",   color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  submitted:        { text: "Actif",        color: "#16A34A", bg: "rgba(22,163,74,0.10)" },
  simulated:        { text: "Actif (paper)",color: "#16A34A", bg: "rgba(22,163,74,0.10)" },
  filled:           { text: "Exécuté — position vendue", color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  partially_filled: { text: "Partiellement exécuté", color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  cancelled:        { text: "Annulé",       color: MUTED,     bg: "rgba(139,146,165,0.10)" },
  rejected:         { text: "Rejeté par le courtier", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
  error:            { text: "Erreur",       color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Section « Ordres stop de protection » — page Courtier.
 * Liste les ordres stop avec leur statut rafraîchi depuis SnapTrade (mode
 * live), et permet d'annuler un stop encore actif.
 */
export default function StopOrdersSection() {
  const qc = useQueryClient();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const q = useQuery<StopOrdersResponse>({
    queryKey: ["broker-stop-orders"],
    queryFn: () => fetch(`${BASE}/api/broker/stop-orders`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const cancelMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/broker/orders/${id}/cancel`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Annulation refusée.");
      return data;
    },
    onSuccess: () => {
      setCancelError(null);
      qc.invalidateQueries({ queryKey: ["broker-stop-orders"] });
      qc.invalidateQueries({ queryKey: ["broker-orders"] });
    },
    onError: (err) => {
      setCancelError(err instanceof Error ? err.message : String(err));
      // Le refus peut signifier « déjà exécuté » — on recharge pour voir le vrai statut
      qc.invalidateQueries({ queryKey: ["broker-stop-orders"] });
    },
  });

  const orders = q.data?.orders ?? [];
  const activeCount = orders.filter((o) => o.active).length;

  // Ne rien afficher tant qu'aucun ordre stop n'existe — la section apparaît
  // dès qu'un stop de protection a été soumis (actif ou historique).
  if (!q.isLoading && orders.length === 0) return null;

  return (
    <div>
      <div className="section-rule mb-5 flex items-center justify-between gap-4">
        <span>ORDRES STOP DE PROTECTION{activeCount > 0 ? ` — ${activeCount} ACTIF${activeCount > 1 ? "S" : ""}` : ""}</span>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-lg transition-opacity"
          style={{
            background: "rgba(212,167,44,0.10)",
            border: "1px solid rgba(212,167,44,0.30)",
            color: q.isFetching ? MUTED : ACCENT,
            cursor: q.isFetching ? "not-allowed" : "pointer",
          }}
          title="Rafraîchit le statut de chaque stop depuis le courtier (exécuté, annulé, rejeté…)"
        >
          {q.isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {q.isFetching ? "Vérification…" : "Vérifier chez le courtier"}
        </button>
      </div>

      {q.data?.syncError && (
        <div className="mb-3 flex items-center gap-2 text-[11px] rounded-lg px-3 py-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Impossible de vérifier chez le courtier — statuts affichés depuis le cache local.
        </div>
      )}

      {cancelError && (
        <div className="mb-3 flex items-center gap-2 text-[11px] rounded-lg px-3 py-2" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#DC2626" }}>
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          {cancelError}
        </div>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: MUTED }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement des ordres stop…
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const badge = STATUS_BADGE[o.status] ?? { text: o.status, color: MUTED, bg: "rgba(139,146,165,0.10)" };
            return (
              <div key={o.id} className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${o.active ? "rgba(22,163,74,0.25)" : BORDER}` }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: o.active ? "#16A34A" : MUTED }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ ...MONO, color: "#E8E9ED" }}>{o.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: "rgba(139,146,165,0.10)", color: MUTED }}>{o.mode}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33` }}>
                          {badge.text}
                        </span>
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: MUTED }}>
                        <span style={MONO}>Vente stop de {o.filledQuantity ?? o.quantity}</span>
                        {o.expectedPrice && <span style={MONO}> · déclenchement ~{formatPrice(Number(o.expectedPrice))}</span>}
                        {o.fillPrice && <span style={MONO}> · exécuté à {formatPrice(Number(o.fillPrice))}</span>}
                        <span> · {fmtDate(o.submittedAt ?? o.createdAt)}</span>
                      </div>
                      {o.errorMessage && (
                        <div className="text-[11px] mt-1" style={{ color: "#DC2626" }}>{o.errorMessage}</div>
                      )}
                    </div>
                  </div>
                  {o.active && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Annuler l'ordre stop sur ${o.symbol} ?\n\nTa position ne sera plus protégée par ce stop.`)) {
                          cancelMut.mutate(o.id);
                        }
                      }}
                      disabled={cancelMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-[0.1em] transition-opacity disabled:opacity-40 shrink-0"
                      style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)", color: "#DC2626" }}
                    >
                      {cancelMut.isPending && cancelMut.variables === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                      Annuler
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
