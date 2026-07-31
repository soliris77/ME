/**
 * Débriefing quotidien — raconte la journée de trading :
 * P&L réalisé, ordres (auto vs manuel, exécutés vs échoués), activité
 * auto-trader, événements critiques. Lecture seule, navigable par date.
 */
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  CalendarCheck, ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown,
  Cpu, ScrollText, Receipt, AlertTriangle, GraduationCap,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TradeFinding { tone: "good" | "warn" | "info"; text: string }
interface DebriefOrder {
  id: number; createdAt: string; symbol: string; side: string; quantity: string;
  orderType: string; mode: string; status: string; fillPrice: string | null;
  expectedPrice: string | null; errorMessage: string | null; isAuto: boolean;
  analysis: TradeFinding[];
}
interface DebriefLog {
  id: number; createdAt: string; symbol: string; side: string; triggerType: string;
  signalScore: number | null; signalVerdict: string | null; price: string | null;
  quantity: string | null; orderId: number | null; notes: string | null;
}
interface DebriefAudit { id: number; createdAt: string; action: string; summary: string }
interface Debrief {
  date: string;
  realizedPnL: number;
  unmatchedSells: { symbol: string; quantity: number }[];
  stats: { totalOrders: number; buys: number; sells: number; executed: number; failed: number; auto: number; manual: number };
  orders: DebriefOrder[];
  autoTrader: DebriefLog[];
  audit: DebriefAudit[];
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<string, string> = {
  filled: "Exécuté", partially_filled: "Partiel", simulated: "Simulé",
  submitted: "Soumis", pending: "En attente", rejected: "Rejeté", error: "Erreur",
};
const TRIGGER_LABEL: Record<string, string> = {
  order: "Ordre", notification_only: "Notification", stop_loss: "Stop-loss", take_profit: "Take-profit",
};

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "gain" | "loss" | "neutral" }) {
  const cls = tone === "gain" ? "gain" : tone === "loss" ? "loss" : "text-foreground";
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`text-xl font-mono font-bold ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function DebriefPage() {
  usePageMeta("Débriefing quotidien — Soliris Market", "Bilan de la journée de trading : P&L, ordres, auto-trader, événements.");
  const [date, setDate] = useState(todayUTC);
  const isToday = date === todayUTC();

  const q = useQuery<Debrief>({
    queryKey: ["debrief", date],
    queryFn: () => fetch(`${BASE}/api/debrief?date=${date}`).then((r) => {
      if (!r.ok) throw new Error("Erreur serveur");
      return r.json();
    }),
    refetchInterval: isToday ? 60_000 : false,
    staleTime: isToday ? 30_000 : Infinity,
  });
  const d = q.data;

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto animate-fadeUp">
      {/* Header */}
      <div className="mb-6">
        <div className="section-rule mb-4"><span>DÉBRIEFING</span></div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
            <CalendarCheck className="w-5 h-5 text-primary" />
            Débriefing quotidien
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate((v) => shiftDate(v, -1))}
              className="p-2 rounded-lg border border-input hover:bg-muted transition-colors"
              aria-label="Jour précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date" value={date} max={todayUTC()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-input rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => setDate((v) => shiftDate(v, 1))}
              disabled={isToday}
              className="p-2 rounded-lg border border-input hover:bg-muted transition-colors disabled:opacity-40"
              aria-label="Jour suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Ce que la journée raconte : P&L réalisé, ordres passés, décisions de l'auto-trader
          et événements critiques. Jours en heure UTC (comme le coupe-circuit).
        </p>
      </div>

      {q.isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      {q.isError && (
        <div className="rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/25 text-sm text-red-400">
          Impossible de charger le débriefing. Réessaie dans un instant.
        </div>
      )}

      {d && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <KpiCard
              label="P&L réalisé"
              value={`${d.realizedPnL >= 0 ? "+" : "−"}$${Math.abs(d.realizedPnL).toFixed(2)}`}
              tone={d.realizedPnL > 0 ? "gain" : d.realizedPnL < 0 ? "loss" : "neutral"}
              sub="ventes du jour uniquement"
            />
            <KpiCard label="Ordres" value={String(d.stats.totalOrders)} sub={`${d.stats.buys} achat${d.stats.buys > 1 ? "s" : ""} · ${d.stats.sells} vente${d.stats.sells > 1 ? "s" : ""}`} />
            <KpiCard label="Exécutés / Échoués" value={`${d.stats.executed} / ${d.stats.failed}`} tone={d.stats.failed > 0 ? "loss" : "neutral"} />
            <KpiCard label="Auto / Manuel" value={`${d.stats.auto} / ${d.stats.manual}`} sub="ordres déclenchés par l'auto-trader" />
          </div>

          {d.unmatchedSells.length > 0 && (
            <div className="mb-6 flex items-start gap-2 rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {d.unmatchedSells.length} vente{d.unmatchedSells.length > 1 ? "s" : ""} sans coût d'achat connu
                ({d.unmatchedSells.map((s) => s.symbol).join(", ")}) — exclue{d.unmatchedSells.length > 1 ? "s" : ""} du P&L.
              </span>
            </div>
          )}

          {/* Ordres du jour */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-4 h-4 text-primary/70" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/70">Ordres du jour</h2>
            </div>
            {d.orders.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-card border border-card-border rounded-xl px-4 py-5 text-center">
                Aucun ordre ce jour-là.
              </p>
            ) : (
              <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      <th className="px-4 py-2.5">Heure</th>
                      <th className="px-4 py-2.5">Titre</th>
                      <th className="px-4 py-2.5">Sens</th>
                      <th className="px-4 py-2.5 text-right">Qté</th>
                      <th className="px-4 py-2.5 text-right">Prix</th>
                      <th className="px-4 py-2.5">Statut</th>
                      <th className="px-4 py-2.5">Origine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.orders.map((o) => (
                      <Fragment key={o.id}>
                        <tr className="border-b border-border/20 last:border-0">
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">{fmtTime(o.createdAt)}</td>
                          <td className="px-4 py-2.5 font-mono font-semibold">{o.symbol}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 font-semibold ${o.side === "BUY" ? "gain" : "loss"}`}>
                              {o.side === "BUY" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {o.side === "BUY" ? "Achat" : "Vente"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono sensitive">{o.quantity}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{o.fillPrice ?? o.expectedPrice ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={["rejected", "error"].includes(o.status) ? "text-red-400" : ["filled", "simulated", "partially_filled"].includes(o.status) ? "text-emerald-400" : "text-muted-foreground"}>
                              {STATUS_LABEL[o.status] ?? o.status}
                            </span>
                            {o.errorMessage && <div className="text-[10px] text-red-400/70 mt-0.5 max-w-48 truncate" title={o.errorMessage}>{o.errorMessage}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{o.isAuto ? "Auto-trader" : "Manuel"}{o.mode === "paper" ? " · papier" : ""}</td>
                        </tr>
                        {o.analysis?.length > 0 && (
                          <tr className="border-b border-border/20 last:border-0">
                            <td colSpan={7} className="px-4 pb-3 pt-0">
                              <div className="flex items-start gap-2 rounded-lg bg-muted/30 border border-border/30 px-3 py-2">
                                <GraduationCap className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/60" />
                                <ul className="space-y-0.5">
                                  {o.analysis.map((f, i) => (
                                    <li key={i} className={`text-[11px] leading-relaxed ${f.tone === "warn" ? "text-amber-400" : f.tone === "good" ? "text-emerald-400/90" : "text-muted-foreground"}`}>
                                      {f.text}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Auto-trader */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-primary/70" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/70">Activité de l'auto-trader</h2>
            </div>
            {d.autoTrader.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-card border border-card-border rounded-xl px-4 py-5 text-center">
                Aucun déclenchement ce jour-là.
              </p>
            ) : (
              <div className="space-y-2">
                {d.autoTrader.map((l) => (
                  <div key={l.id} className="bg-card border border-card-border rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap text-[12px]">
                    <span className="font-mono text-muted-foreground">{fmtTime(l.createdAt)}</span>
                    <span className="font-mono font-semibold">{l.symbol}</span>
                    <span className={`font-semibold ${l.side === "BUY" ? "gain" : "loss"}`}>{l.side === "BUY" ? "Achat" : "Vente"}</span>
                    <span className="px-2 py-0.5 rounded bg-muted/50 text-[10px] uppercase tracking-wider">{TRIGGER_LABEL[l.triggerType] ?? l.triggerType}</span>
                    {l.signalScore != null && <span className="text-muted-foreground">score {l.signalScore}{l.signalVerdict ? ` (${l.signalVerdict})` : ""}</span>}
                    {l.price && <span className="font-mono">@ {l.price}</span>}
                    {l.notes && <span className="text-muted-foreground/70 text-[11px] w-full">{l.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ScrollText className="w-4 h-4 text-primary/70" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/70">Événements critiques</h2>
            </div>
            {d.audit.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-card border border-card-border rounded-xl px-4 py-5 text-center">
                Rien à signaler ce jour-là.
              </p>
            ) : (
              <div className="space-y-1.5">
                {d.audit.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-[12px] bg-card border border-card-border rounded-xl px-4 py-2.5">
                    <span className="font-mono text-muted-foreground shrink-0">{fmtTime(a.createdAt)}</span>
                    <span className="text-foreground/90">{a.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
