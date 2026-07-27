import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { formatPrice } from "@/lib/format";
import { ScrollText, Download, Printer, RefreshCw, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMemo, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Order {
  id: number;
  signalId: string;
  symbol: string;
  side: string;
  quantity: string;
  orderType: string;
  mode: "paper" | "live";
  status: string;
  expectedPrice: string | null;
  fillPrice: string | null;
  filledQuantity: string | null;
  brokerAccountId: string | null;
  errorMessage: string | null;
  submittedAt: string | null;
  createdAt: string;
}

function useOrders() {
  return useQuery<Order[]>({
    queryKey: ["broker-orders"],
    queryFn: () => fetch(`${BASE}/api/broker/orders`).then((r) => r.json()),
    refetchInterval: 30_000,
  });
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "En attente", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  submitted: { text: "Soumis", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  filled: { text: "Rempli", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  partially_filled: { text: "Partiellement rempli", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  rejected: { text: "Rejeté", cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  error: { text: "Erreur", cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

function toCsvValue(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportCsv(orders: Order[]) {
  const headers = [
    "Date", "Symbole", "Sens", "Quantité", "Type", "Mode", "Statut",
    "Prix attendu", "Prix d'exécution", "Quantité exécutée", "Compte", "Erreur",
  ];
  const rows = orders.map((o) => [
    fmtDate(o.submittedAt ?? o.createdAt),
    o.symbol,
    o.side,
    o.quantity,
    o.orderType,
    o.mode,
    STATUS_LABEL[o.status]?.text ?? o.status,
    o.expectedPrice ?? "",
    o.fillPrice ?? "",
    o.filledQuantity ?? "",
    o.brokerAccountId ?? "",
    o.errorMessage ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map(toCsvValue).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `soliris-market-journal-ordres-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Orders() {
  usePageMeta("Journal des ordres — Soliris Market", "Historique complet des ordres soumis au courtier, exportable en CSV.");
  const q = useOrders();
  const orders = useMemo(() => q.data ?? [], [q.data]);
  const [modeFilter, setModeFilter] = useState<"all" | "paper" | "live">("all");

  const filtered = useMemo(
    () => (modeFilter === "all" ? orders : orders.filter((o) => o.mode === modeFilter)),
    [orders, modeFilter]
  );

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-fadeUp print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <div className="section-rule mb-4"><span>JOURNAL</span></div>
          <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
            <ScrollText className="w-5 h-5 text-primary" />
            Journal des ordres
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Les 50 ordres les plus récents soumis au courtier, tous modes confondus. Exportez-les en
            CSV pour vos déclarations fiscales ou imprimez un journal en PDF via votre navigateur.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-input hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </button>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Exporter CSV
          </button>
          <button
            onClick={() => window.print()}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimer / PDF
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4 print:hidden">
        {(["all", "paper", "live"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModeFilter(m)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              modeFilter === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            {m === "all" ? "Tous" : m === "paper" ? "Paper" : "Live"}
          </button>
        ))}
      </div>

      <h1 className="hidden print:block text-xl font-bold mb-4">Soliris Market — Journal des ordres</h1>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-card-border rounded-xl p-8 text-center">
          Aucun ordre {modeFilter !== "all" ? `en mode ${modeFilter} ` : ""}pour le moment.
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl overflow-x-auto print:border-0 print:bg-transparent">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Symbole</th>
                <th className="px-4 py-2.5 font-medium">Sens</th>
                <th className="px-4 py-2.5 font-medium text-right">Quantité</th>
                <th className="px-4 py-2.5 font-medium">Mode</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 font-medium text-right">Prix exécuté</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((o) => {
                const status = STATUS_LABEL[o.status] ?? { text: o.status, cls: "bg-muted text-muted-foreground border-border" };
                const buy = o.side.toUpperCase() === "BUY";
                return (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(o.submittedAt ?? o.createdAt)}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold">{o.symbol}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${buy ? "gain" : "loss"}`}>
                        {buy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {buy ? "Achat" : "Vente"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{o.filledQuantity ?? o.quantity}</td>
                    <td className="px-4 py-2.5 text-xs uppercase text-muted-foreground">{o.mode}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${status.cls}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {o.fillPrice ? formatPrice(Number(o.fillPrice)) : o.expectedPrice ? `~${formatPrice(Number(o.expectedPrice))}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
