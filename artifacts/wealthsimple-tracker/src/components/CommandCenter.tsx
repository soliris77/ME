/**
 * Centre de commande — bandeau du tableau de bord.
 * En 1 seconde : comment va ma journée (P&L réalisé), le trading est-il actif
 * (coupe-circuit), et où j'en suis face à ma limite de perte quotidienne.
 * Code couleur du risque : vert = dans le plan, ambre = limite proche (≥80 %),
 * rouge = limite atteinte ou coupe-circuit déclenché.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Gauge, TrendingUp, TrendingDown, ChevronRight, WifiOff } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BrokerStatus { halted?: boolean; haltedAt?: string | null }
interface DailyPnl { realizedPnL: number; maxDailyLossAmount: number | null; mode: string }
interface RiskSettings { mode: "dry_run" | "live"; killSwitchActive: boolean; accountId: string }

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new Error("Réponse non JSON");
  return r.json();
}

export default function CommandCenter() {
  const queryClient = useQueryClient();
  const statusQ = useQuery<BrokerStatus>({
    queryKey: ["broker-status"],
    queryFn: () => fetchJson<BrokerStatus>("/api/broker/status"),
    refetchInterval: 30_000,
  });
  const pnlQ = useQuery<DailyPnl>({
    queryKey: ["auto-trader-daily-pnl"],
    queryFn: () => fetchJson<DailyPnl>("/api/auto-trader/daily-pnl"),
    refetchInterval: 30_000,
  });
  const riskQ = useQuery<RiskSettings>({
    queryKey: ["risk-settings"],
    queryFn: () => fetchJson<RiskSettings>("/api/auto-trader/risk-settings"),
    refetchInterval: 30_000,
  });
  const kill = useMutation({
    mutationFn: () => fetch(`${BASE}/api/auto-trader/risk-settings/kill-switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["risk-settings"] }),
  });

  // Chargement initial : rien (pas de squelette bruyant).
  if (statusQ.isLoading || pnlQ.isLoading) return null;

  // Erreur : un bandeau de statut risque ne doit JAMAIS disparaître en silence.
  if (statusQ.isError || pnlQ.isError || typeof pnlQ.data?.realizedPnL !== "number") {
    return (
      <div className="mb-7 flex items-center gap-2.5 rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400 animate-fadeUp">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>État du trading indisponible pour le moment — P&L et coupe-circuit non vérifiables. Nouvel essai automatique dans 30 s.</span>
      </div>
    );
  }

  // `halted` absent = aucune connexion courtier configurée : ne pas prétendre que le trading est actif.
  const haltedKnown = typeof statusQ.data?.halted === "boolean";
  const halted = statusQ.data?.halted === true;
  const { realizedPnL, maxDailyLossAmount, mode } = pnlQ.data;
  const loss = realizedPnL < 0 ? Math.abs(realizedPnL) : 0;
  const hasLimit = maxDailyLossAmount != null && maxDailyLossAmount > 0;
  const ratio = hasLimit ? Math.min(loss / maxDailyLossAmount!, 1) : 0;
  const limitReached = hasLimit && ratio >= 1; // à 100 %, jamais vert — même si le breaker (strictement >) n'a pas encore sauté
  const nearLimit = hasLimit && ratio >= 0.8 && !limitReached && !halted;
  const limitDanger = halted || limitReached;

  const barColor = limitDanger ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-emerald-500";
  const pnlUp = realizedPnL > 0;
  const pnlDown = realizedPnL < 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7 animate-fadeUp">
      <div className="sm:col-span-3 flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 px-4 py-2">
        <div className="flex items-center gap-2">
          {riskQ.data?.mode === "dry_run" && <span className="rounded-md border border-amber-400/50 bg-amber-400/15 px-2 py-1 text-[10px] font-bold tracking-[0.16em] text-amber-300 animate-pulse">DRY RUN</span>}
          <span className="text-[11px] text-muted-foreground">{riskQ.data?.killSwitchActive ? "Kill-switch actif — les protections restent en place." : "Garde-fous de risque actifs"}</span>
        </div>
        <button type="button" onClick={() => kill.mutate()} disabled={kill.isPending || riskQ.data?.killSwitchActive} className="rounded-lg border border-red-500/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40">
          {riskQ.data?.killSwitchActive ? "Trading suspendu" : "Activer le kill-switch"}
        </button>
      </div>
      {/* P&L réalisé du jour */}
      <Link
        href="/debrief"
        className="bg-card border border-card-border rounded-xl p-4 flex flex-col justify-between hover:border-primary/30 transition-colors group"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">P&L réalisé du jour</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
        </div>
        <div className={`flex items-center gap-2 text-2xl font-mono font-bold sensitive ${pnlUp ? "gain" : pnlDown ? "loss" : "text-foreground"}`}>
          {pnlUp && <TrendingUp className="w-5 h-5" />}
          {pnlDown && <TrendingDown className="w-5 h-5" />}
          {pnlUp ? "+" : pnlDown ? "−" : ""}${Math.abs(realizedPnL).toFixed(2)}
        </div>
        <span className="text-[11px] text-muted-foreground mt-1">ventes du jour · mode {mode === "paper" ? "papier" : "réel"}</span>
      </Link>

      {/* État du coupe-circuit */}
      <Link
        href={haltedKnown ? "/auto-trader" : "/courtier"}
        className={`rounded-xl p-4 flex flex-col justify-between border transition-colors group ${
          halted ? "bg-red-500/10 border-red-500/30 hover:border-red-500/50" : "bg-card border-card-border hover:border-emerald-500/30"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Coupe-circuit</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:opacity-100 transition-colors" />
        </div>
        {!haltedKnown ? (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <ShieldQuestion className="w-5 h-5" />
              Courtier non connecté
            </div>
            <span className="text-[11px] text-muted-foreground mt-1">connecte ton courtier pour activer la protection</span>
          </>
        ) : (
          <>
            <div className={`flex items-center gap-2 text-sm font-semibold ${halted ? "text-red-400" : "text-emerald-400"}`}>
              {halted ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
              {halted ? "Trading suspendu" : "Trading actif"}
              {!halted && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            </div>
            <span className="text-[11px] text-muted-foreground mt-1">
              {halted ? "coupe-circuit ou arrêt manuel — réactivation depuis Auto-Trader" : "aucun blocage en cours"}
            </span>
          </>
        )}
      </Link>

      {/* Limite de perte quotidienne */}
      <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Limite de perte du jour</span>
          <Gauge className={`w-3.5 h-3.5 ${limitDanger ? "text-red-400" : nearLimit ? "text-amber-400" : "text-muted-foreground/40"}`} />
        </div>
        {hasLimit ? (
          <>
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className={`text-lg font-bold sensitive ${limitDanger ? "text-red-400" : nearLimit ? "text-amber-400" : "text-foreground"}`}>
                ${loss.toFixed(2)}
              </span>
              <span className="text-[11px] text-muted-foreground sensitive">/ ${maxDailyLossAmount!.toFixed(0)}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.max(ratio * 100, loss > 0 ? 2 : 0)}%` }} />
            </div>
            <span className={`text-[11px] mt-1.5 ${limitDanger ? "text-red-400/80" : nearLimit ? "text-amber-400/80" : "text-muted-foreground"}`}>
              {halted ? "trading suspendu" : limitReached ? "limite atteinte" : nearLimit ? "attention : ≥ 80 % de la limite" : "dans le plan"}
            </span>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">Aucune limite configurée</span>
            <Link href="/auto-trader" className="text-[11px] text-primary hover:underline mt-1.5">
              Définir une limite dans les réglages de risque →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
