import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  ShieldCheck, Loader2, ExternalLink, RefreshCw, CheckCircle2,
  XCircle, LinkIcon, ShieldOff, ShieldAlert, AlertTriangle,
  Radio, Building2, KeyRound, Wifi, WifiOff, ArrowRight, Save, Eye, EyeOff, Timer
} from "lucide-react";

import StopOrdersSection from "@/components/StopOrdersSection";
import AllocationSection from "@/components/AllocationSection";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BrokerStatus {
  mode: "paper" | "live";
  hasCredentials: boolean;
  connected: boolean;
  status: "not_setup" | "pending" | "connected" | "error";
  userId?: string;
  lastSyncedAt?: string | null;
  apiOk?: boolean;
  halted: boolean;
  haltedAt?: string | null;
}

interface Account {
  id?: string;
  number?: string;
  name?: string;
  balance?: { total?: { amount?: number; currency?: string } } | number | null;
  currency?: string;
  type?: string;
  institution_name?: string;
  brokerage?: { name?: string };
  meta?: { type?: string; currency?: string; unifiedAccountType?: string; institution_name?: string };
}

interface BalanceLine {
  currency?: string;
  cash?: number;
  buying_power?: number;
  market_value?: number;
  total_value?: number;
}

/* ── Design tokens (dark) ───────────────────────────────── */
const ACCENT  = "#D4A72C";
const SURFACE = "#131722";
const BASE_BG = "#0B0E14";
const BORDER  = "#232838";
const MUTED   = "#8B92A5";
const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: "tabular-nums" };

/* ── Step pill ──────────────────────────────────────────── */
function StepNum({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  if (done)
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0" style={{ background: "rgba(22,163,74,0.15)", border: "1px solid rgba(22,163,74,0.4)" }}>
        <CheckCircle2 className="w-4 h-4" style={{ color: "#16A34A" }} />
      </div>
    );
  return (
    <div
      className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-sm font-bold"
      style={{
        background: active ? "rgba(212,167,44,0.15)" : "rgba(139,146,165,0.08)",
        border: `1px solid ${active ? "rgba(212,167,44,0.45)" : BORDER}`,
        color: active ? ACCENT : MUTED,
      }}
    >
      {n}
    </div>
  );
}

/* ── Account balance pill ───────────────────────────────── */
function AccountBalance({ accountId }: { accountId: string }) {
  const q = useQuery<BalanceLine[]>({
    queryKey: ["broker-balance", accountId],
    queryFn: () => fetch(`${BASE}/api/broker/balances/${encodeURIComponent(accountId)}`).then((r) => r.json()),
    staleTime: 30_000,
    retry: false,
  });

  if (q.isLoading) return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: MUTED }} />;
  if (!q.data || !Array.isArray(q.data) || q.data.length === 0)
    return (
      <p className="text-[11px] mt-2" style={{ color: MUTED }}>
        Solde pas encore synchronisé — clique sur « Rafraîchir les soldes » puis réessaie.
      </p>
    );

  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
      {q.data.map((b, i) => {
        const cur = b.currency ?? "";
        const fmt = (v?: number) => v == null ? null : v.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const lines: { label: string; value: string }[] = [];
        if (fmt(b.cash) != null) lines.push({ label: "Liquidités", value: `${cur} ${fmt(b.cash)}` });
        if (b.buying_power != null && b.buying_power !== b.cash) lines.push({ label: "Pouvoir d'achat", value: `${cur} ${fmt(b.buying_power)}` });
        if (fmt(b.market_value) != null) lines.push({ label: "Valeur marché", value: `${cur} ${fmt(b.market_value)}` });
        if (fmt(b.total_value) != null) lines.push({ label: "Total", value: `${cur} ${fmt(b.total_value)}` });
        return lines.map((l) => (
          <span key={`${i}-${l.label}`} className="text-[11px]" style={MONO}>
            <span style={{ color: MUTED }}>{l.label} : </span>
            <span className="sensitive" style={{ color: "#E8E9ED" }}>{l.value}</span>
          </span>
        ));
      })}
    </div>
  );
}

/* ── Expiry countdown ───────────────────────────────────── */
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    const update = () => {
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft("Expiré");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}m ${s.toString().padStart(2, "0")}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return <span className="font-mono text-[11px]">{timeLeft}</span>;
}

/* ── Main page ──────────────────────────────────────────── */
export default function BrokerPage() {
  usePageMeta("Courtier — Soliris Market", "Connexion courtier SnapTrade / Wealthsimple.");
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Formulaire credentials ──
  const [credsForm, setCredsForm] = useState({ clientId: "", consumerKey: "" });
  const [showSecrets, setShowSecrets] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);

  // ── Formulaire Armement Live ──
  const [arming, setArming] = useState(false);
  const [armForm, setArmForm] = useState({
    accountId: "",
    maxOrderValue: 1000,
    dailyLossCap: 50,
    durationMinutes: 60
  });

  const statusQ = useQuery<BrokerStatus>({
    queryKey: ["broker-status"],
    queryFn: () => fetch(`${BASE}/api/broker/status`).then((r) => r.json()),
    refetchInterval: 15_000,
  });

  const tradingModeQ = useQuery<{ mode: "paper" | "live", arm: { accountId: string, maxOrderValue: number, dailyLossCap: number, armedAt: string, expiresAt: string, active: boolean } | null }>({
    queryKey: ["trading-mode-details"],
    queryFn: () => fetch(`${BASE}/api/broker/trading-mode`).then((r) => r.json()),
    refetchInterval: 10_000,
  });

  const accountsQ = useQuery<Account[]>({
    queryKey: ["broker-accounts"],
    queryFn: () => fetch(`${BASE}/api/broker/accounts`).then((r) => r.json()),
    enabled: (statusQ.data?.status ?? "not_setup") !== "not_setup",
    staleTime: 60_000,
  });

  const credsMut = useMutation({
    mutationFn: (data: typeof credsForm) =>
      fetch(`${BASE}/api/broker/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: data.clientId, consumerKey: data.consumerKey }),
      }).then((r) => r.json()),
    onSuccess: (d) => {
      if (d.ok) {
        setCredsSaved(true);
        setCredsForm({ clientId: "", consumerKey: "" });
        qc.invalidateQueries({ queryKey: ["broker-status"] });
      }
    },
  });

  const resetMut    = useMutation({ mutationFn: () => fetch(`${BASE}/api/broker/reset`,  { method: "POST" }).then((r) => r.json()), onSuccess: () => { qc.invalidateQueries({ queryKey: ["broker-status"] }); qc.invalidateQueries({ queryKey: ["broker-accounts"] }); } });
  const setupMut    = useMutation({ mutationFn: () => fetch(`${BASE}/api/broker/setup`,        { method: "POST" }).then((r) => r.json()), onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-status"] }) });
  const connectMut  = useMutation({ mutationFn: () => fetch(`${BASE}/api/broker/connect-url`).then((r) => r.json()), onSuccess: (d) => { if (d.redirectURI) window.open(d.redirectURI, "_blank", "noopener,noreferrer"); qc.invalidateQueries({ queryKey: ["broker-status"] }); } });
  const syncMut     = useMutation({ mutationFn: () => fetch(`${BASE}/api/broker/sync`,         { method: "POST" }).then((r) => r.json()), onSuccess: () => { qc.invalidateQueries({ queryKey: ["broker-status"] }); qc.invalidateQueries({ queryKey: ["broker-accounts"] }); } });
  const haltMut     = useMutation({ mutationFn: () => fetch(`${BASE}/api/broker/halt`,         { method: "POST" }).then((r) => r.json()), onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-status"] }) });
  const refreshMut  = useMutation({
    mutationFn: () => fetch(`${BASE}/api/broker/refresh`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      // Invalide les soldes de tous les comptes après le refresh
      qc.invalidateQueries({ queryKey: ["broker-balance"] });
      qc.invalidateQueries({ queryKey: ["broker-accounts"] });
    },
  });
  const resumeMut   = useMutation({ mutationFn: () => fetch(`${BASE}/api/broker/resume`,       { method: "POST" }).then((r) => r.json()), onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-status"] }) });

  const armLiveMut = useMutation({
    mutationFn: (data: typeof armForm) =>
      fetch(`${BASE}/api/broker/trading-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "live", ...data }),
      }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Erreur d'activation");
        return j;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broker-status"] });
      qc.invalidateQueries({ queryKey: ["trading-mode"] });
      qc.invalidateQueries({ queryKey: ["trading-mode-details"] });
      setArming(false);
    }
  });

  const disarmMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/broker/trading-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "paper" }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broker-status"] });
      qc.invalidateQueries({ queryKey: ["trading-mode"] });
      qc.invalidateQueries({ queryKey: ["trading-mode-details"] });
    }
  });

  const s = statusQ.data;
  const step = !s ? 0 : s.status === "not_setup" ? 1 : s.status === "pending" ? 2 : 3;
  const accounts: Account[] = Array.isArray(accountsQ.data) ? accountsQ.data : [];

  /* ── Btn helper ─── */
  const Btn = ({ onClick, disabled, children, variant = "gold" }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; variant?: "gold" | "muted" | "danger" | "green" }) => {
    const styles: Record<string, React.CSSProperties> = {
      gold:   { background: "rgba(212,167,44,0.12)",  border: "1px solid rgba(212,167,44,0.35)",  color: ACCENT },
      muted:  { background: "rgba(139,146,165,0.08)", border: `1px solid ${BORDER}`,              color: MUTED  },
      danger: { background: "rgba(220,38,38,0.08)",   border: "1px solid rgba(220,38,38,0.35)",   color: "#DC2626" },
      green:  { background: "rgba(22,163,74,0.10)",   border: "1px solid rgba(22,163,74,0.35)",   color: "#16A34A" },
    };
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold tracking-[0.1em] uppercase transition-opacity disabled:opacity-40"
        style={styles[variant]}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto animate-fadeUp space-y-8">

      {/* ── En-tête ─────────────────────────────────────────── */}
      <div>
        <div className="section-rule mb-4"><span>COURTIER</span></div>
        <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em]">Connexion Wealthsimple</h1>
        <p className="mt-2 text-sm max-w-xl" style={{ color: MUTED }}>
          Via SnapTrade, Soliris Market accède à ton compte Wealthsimple pour lire tes positions et, en mode live, soumettre des ordres automatisés.
        </p>
      </div>

      {/* ── Mode paper / live ────────────────────────────────── */}
      {s && (
        <div className="rounded-xl overflow-hidden transition-colors" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              {tradingModeQ.data?.mode === "live" ? (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: ACCENT }} />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: ACCENT }} />
                </span>
              ) : (
                <span className="inline-flex h-2.5 w-2.5 rounded-full shrink-0" style={{ background: BORDER }} />
              )}
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-0.5" style={{ color: MUTED }}>Mode de trading</div>
                <div className="text-sm font-semibold tracking-wide" style={tradingModeQ.data?.mode === "live" ? { color: ACCENT } : { color: "#E8E9ED" }}>
                  {tradingModeQ.data?.mode === "live" ? "Live — ordres réels" : "Paper — simulation"}
                </div>
              </div>
            </div>

            {tradingModeQ.data?.mode === "live" ? (
               <Btn variant="muted" disabled={disarmMut.isPending} onClick={() => disarmMut.mutate()}>
                 {disarmMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                 Repasser en Paper
               </Btn>
            ) : (
               <Btn variant="gold" disabled={armLiveMut.isPending} onClick={() => setArming(!arming)}>
                 <ShieldCheck className="w-3.5 h-3.5" />
                 {arming ? "Annuler l'armement" : "Armer le Live"}
               </Btn>
            )}
          </div>

          {/* Active Live Status Bar */}
          {tradingModeQ.data?.mode === "live" && tradingModeQ.data?.arm && (
            <div className="border-t px-5 py-3 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: BORDER, background: "rgba(212,167,44,0.03)" }}>
               <div className="flex items-center gap-5 text-[11px]" style={{ color: MUTED }}>
                 <div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Compte : <span className="font-mono text-[#E8E9ED]">{accounts.find(a => a.id === tradingModeQ.data.arm?.accountId)?.name || tradingModeQ.data.arm.accountId}</span></div>
                 <div className="flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5" /> Max Ordre : <span className="font-mono text-[#E8E9ED]">{tradingModeQ.data.arm.maxOrderValue}$</span></div>
                 <div className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> Max Perte : <span className="font-mono text-[#E8E9ED]">{tradingModeQ.data.arm.dailyLossCap}$</span></div>
               </div>
               <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: ACCENT }}>
                 <Timer className="w-3.5 h-3.5" />
                 <ExpiryCountdown expiresAt={tradingModeQ.data.arm.expiresAt} />
               </div>
            </div>
          )}

          {/* Arming Form Expansion */}
          {arming && tradingModeQ.data?.mode !== "live" && (
            <div className="border-t p-5 animate-fadeUp space-y-5" style={{ borderColor: BORDER, background: "rgba(212,167,44,0.02)" }}>
              <div className="flex items-start gap-3 p-3.5 rounded-lg text-[12px] leading-relaxed" style={{ background: "rgba(212,167,44,0.06)", border: "1px solid rgba(212,167,44,0.25)", color: "#E8E9ED" }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ACCENT }} />
                <div>
                  <strong style={{ color: ACCENT }}>Attention : </strong>
                  Activer le mode Live ne place aucun ordre immédiatement. Cela arme le système pour une durée limitée. Pendant cette période, le trader automatique (s'il est activé) ou tes actions manuelles soumettront de <strong>vrais ordres</strong> à Wealthsimple.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] mb-1.5 uppercase tracking-[0.15em] font-semibold" style={{ color: MUTED }}>Compte cible</label>
                  <select
                    value={armForm.accountId}
                    onChange={(e) => setArmForm({...armForm, accountId: e.target.value})}
                    className="w-full rounded-md px-3 py-2.5 text-[12px] outline-none"
                    style={{ background: BASE_BG, border: `1px solid ${BORDER}`, color: "#E8E9ED" }}
                  >
                    <option value="" disabled>Sélectionner un compte</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name || a.number || a.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] mb-1.5 uppercase tracking-[0.15em] font-semibold" style={{ color: MUTED }}>Durée d'armement (min)</label>
                  <input
                    type="number" min="1" max="480"
                    value={armForm.durationMinutes}
                    onChange={(e) => setArmForm({...armForm, durationMinutes: parseInt(e.target.value) || 0})}
                    className="w-full rounded-md px-3 py-2.5 text-[12px] outline-none font-mono"
                    style={{ background: BASE_BG, border: `1px solid ${BORDER}`, color: "#E8E9ED" }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] mb-1.5 uppercase tracking-[0.15em] font-semibold" style={{ color: MUTED }}>Valeur Max par Ordre ($)</label>
                  <input
                    type="number" min="1"
                    value={armForm.maxOrderValue}
                    onChange={(e) => setArmForm({...armForm, maxOrderValue: parseFloat(e.target.value) || 0})}
                    className="w-full rounded-md px-3 py-2.5 text-[12px] outline-none font-mono"
                    style={{ background: BASE_BG, border: `1px solid ${BORDER}`, color: "#E8E9ED" }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] mb-1.5 uppercase tracking-[0.15em] font-semibold" style={{ color: MUTED }}>Plafond Perte Journalière ($)</label>
                  <input
                    type="number" min="1"
                    value={armForm.dailyLossCap}
                    onChange={(e) => setArmForm({...armForm, dailyLossCap: parseFloat(e.target.value) || 0})}
                    className="w-full rounded-md px-3 py-2.5 text-[12px] outline-none font-mono"
                    style={{ background: BASE_BG, border: `1px solid ${BORDER}`, color: "#E8E9ED" }}
                  />
                </div>
              </div>

              {armLiveMut.error && (
                 <div className="flex items-center gap-2 text-[12px] rounded-lg px-3 py-2.5" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#DC2626" }}>
                   <ShieldOff className="w-4 h-4 shrink-0" />
                   {armLiveMut.error.message}
                 </div>
              )}

              <div className="flex justify-end pt-2">
                <Btn
                  variant="gold"
                  disabled={armLiveMut.isPending || !armForm.accountId || armForm.durationMinutes < 1 || armForm.maxOrderValue <= 0 || armForm.dailyLossCap <= 0}
                  onClick={() => armLiveMut.mutate(armForm)}
                >
                  {armLiveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Armer le système
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Kill-switch (live seulement) ─────────────────────── */}
      {tradingModeQ.data?.mode === "live" && s && (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between gap-4" style={{ background: s.halted ? "rgba(220,38,38,0.06)" : SURFACE, border: `1px solid ${s.halted ? "rgba(220,38,38,0.35)" : BORDER}` }}>
          <div className="flex items-start gap-3">
            {s.halted ? <ShieldOff className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#DC2626" }} /> : <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />}
            <div>
              <div className="text-sm font-semibold mb-0.5" style={{ color: s.halted ? "#DC2626" : "#E8E9ED" }}>
                {s.halted ? "Trading suspendu (kill-switch actif)" : "Kill-switch trading"}
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: MUTED }}>
                {s.halted
                  ? `Aucun ordre soumis à Wealthsimple. Suspendu le ${s.haltedAt ? new Date(s.haltedAt).toLocaleString("fr-CA") : "—"}.`
                  : "Suspend immédiatement tous les ordres live. Persisté en base — actif même après redémarrage."}
              </p>
            </div>
          </div>
          {s.halted
            ? <Btn variant="green" disabled={resumeMut.isPending} onClick={() => resumeMut.mutate()}>{resumeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}Réactiver</Btn>
            : <Btn variant="danger" disabled={haltMut.isPending} onClick={() => { if (window.confirm("Suspendre TOUS les ordres live ?")) haltMut.mutate(); }}>{haltMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}Suspendre</Btn>
          }
        </div>
      )}

      {/* ── Wizard 3 étapes ──────────────────────────────────── */}
      <div>
        <div className="section-rule mb-5"><span>CONFIGURATION DE LA CONNEXION</span></div>

        {/* Étape 1 — Saisie directe des clés SnapTrade */}
        <div className="mb-3 rounded-xl p-5" style={{ background: !s?.hasCredentials ? "rgba(212,167,44,0.04)" : SURFACE, border: `1px solid ${!s?.hasCredentials ? "rgba(212,167,44,0.3)" : BORDER}` }}>
          <div className="flex items-start gap-4">
            <StepNum n={1} done={!!s?.hasCredentials} active={!s?.hasCredentials} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold" style={{ color: "#E8E9ED" }}>Clés SnapTrade</div>
                  <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                    Stockées en base — survivent aux remixes.{" "}
                    <a href="https://app.snaptrade.com/dashboard" target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: ACCENT }}>
                      app.snaptrade.com <ExternalLink className="w-3 h-3 inline" />
                    </a>
                  </div>
                </div>
                {s?.hasCredentials && (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#16A34A" }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Clés présentes
                  </span>
                )}
              </div>

              {/* Formulaire toujours visible pour permettre la mise à jour */}
              <div className="mt-4 rounded-lg p-4 space-y-3" style={{ background: BASE_BG, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>
                    <KeyRound className="w-3.5 h-3.5" /> {s?.hasCredentials ? "Mettre à jour les clés" : "Entrer les clés"}
                  </div>
                  <button
                    onClick={() => setShowSecrets(!showSecrets)}
                    className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-80"
                    style={{ color: MUTED }}
                  >
                    {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showSecrets ? "Masquer" : "Afficher"}
                  </button>
                </div>

                {credsSaved && (
                  <div className="flex items-center gap-2 text-[12px] rounded-lg px-3 py-2" style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", color: "#16A34A" }}>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Clés sauvegardées en base — elles ne seront plus effacées lors des remixes.
                  </div>
                )}

                {credsMut.data?.error && (
                  <div className="text-[12px] rounded-lg px-3 py-2" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#DC2626" }}>
                    {credsMut.data.error}
                  </div>
                )}

                <p className="text-[11px]" style={{ color: MUTED }}>
                  Visibles dans{" "}
                  <a href="https://app.snaptrade.com/dashboard" target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: ACCENT }}>
                    app.snaptrade.com <ExternalLink className="w-3 h-3 inline" />
                  </a>
                  {" "}→ <strong style={{ color: "#E8E9ED" }}>Account Settings</strong>.
                </p>

                {(["clientId", "consumerKey"] as const).map((field) => {
                  const labels: Record<string, string> = { clientId: "Client ID", consumerKey: "Consumer Key" };
                  const hints: Record<string, string> = { clientId: "Ex. : PERS-XXXXXXXXXXXXXXXX", consumerKey: "Consumer Key SnapTrade" };
                  return (
                    <div key={field}>
                      <label className="block text-[11px] mb-1 uppercase tracking-[0.12em]" style={{ color: MUTED }}>{labels[field]}</label>
                      <input
                        type={showSecrets || field === "clientId" ? "text" : "password"}
                        autoComplete="off"
                        value={credsForm[field]}
                        onChange={(e) => { setCredsForm((f) => ({ ...f, [field]: e.target.value })); setCredsSaved(false); }}
                        placeholder={hints[field]}
                        className="w-full rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-1"
                        style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: "#E8E9ED", fontFamily: "'IBM Plex Mono', monospace" } as React.CSSProperties}
                      />
                    </div>
                  );
                })}

                <Btn
                  onClick={() => credsMut.mutate(credsForm)}
                  disabled={credsMut.isPending || !credsForm.clientId || !credsForm.consumerKey}
                >
                  {credsMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Sauvegarder les clés
                </Btn>
              </div>
            </div>
          </div>
        </div>

        {/* Connecteur vertical */}
        <div className="flex justify-start ml-[26px] mb-3">
          <div className="w-px h-4" style={{ background: `linear-gradient(to bottom, ${BORDER}, transparent)` }} />
        </div>

        {/* Étape 2 — Initialiser + Lier */}
        <div className="mb-3 rounded-xl p-5" style={{ background: step === 2 ? "rgba(212,167,44,0.04)" : SURFACE, border: `1px solid ${step === 2 ? "rgba(212,167,44,0.3)" : step > 2 ? "rgba(22,163,74,0.25)" : BORDER}` }}>
          <div className="flex items-start gap-4">
            <StepNum n={2} done={step > 2} active={step === 1 || step === 2} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold" style={{ color: "#E8E9ED" }}>Lier ton compte Wealthsimple</div>
                  <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>Portail OAuth SnapTrade — s'ouvre dans un nouvel onglet</div>
                </div>
                {step > 2 && (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#16A34A" }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Compte lié
                  </span>
                )}
              </div>

              {/* Erreur setup visible */}
              {setupMut.data?.error && (
                <div className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#DC2626" }}>
                  {setupMut.data.error}
                </div>
              )}

              {(step === 1 || step === 2) && s?.hasCredentials && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {step === 1 && (
                    <Btn onClick={() => setupMut.mutate()} disabled={setupMut.isPending}>
                      {setupMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
                      Initialiser
                    </Btn>
                  )}
                  {step === 2 && (
                    <>
                      <Btn onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
                        {connectMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                        Ouvrir le portail Wealthsimple
                      </Btn>
                      <div className="w-full text-[11px] flex items-center gap-2" style={{ color: MUTED }}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "#F59E0B" }} />
                        Connecte-toi dans l'onglet qui s'ouvre, puis reviens ici pour l'étape 3.
                      </div>
                    </>
                  )}
                </div>
              )}

              {step >= 2 && step < 3 && (
                <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: MUTED }}>
                  <ArrowRight className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
                  Initialisation effectuée — ouvre le portail pour lier Wealthsimple
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connecteur vertical */}
        <div className="flex justify-start ml-[26px] mb-3">
          <div className="w-px h-4" style={{ background: `linear-gradient(to bottom, ${BORDER}, transparent)` }} />
        </div>

        {/* Étape 3 — Synchroniser */}
        <div className="rounded-xl p-5" style={{ background: step === 3 ? "rgba(22,163,74,0.04)" : SURFACE, border: `1px solid ${step === 3 ? "rgba(22,163,74,0.3)" : BORDER}` }}>
          <div className="flex items-start gap-4">
            <StepNum n={3} done={false} active={step === 3} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold" style={{ color: step === 3 ? "#E8E9ED" : MUTED }}>Synchroniser les comptes</div>
                  <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                    {s?.lastSyncedAt
                      ? `Dernière synchro : ${new Date(s.lastSyncedAt).toLocaleString("fr-CA")}`
                      : "Disponible après la connexion Wealthsimple"}
                  </div>
                </div>
                {step === 3 && s?.apiOk != null && (
                  s.apiOk
                    ? <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#16A34A" }}><Wifi className="w-3.5 h-3.5" /> API en ligne</span>
                    : <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#DC2626" }}><WifiOff className="w-3.5 h-3.5" /> API hors ligne</span>
                )}
              </div>

              {step === 3 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Btn variant="green" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
                    {syncMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {syncMut.isPending ? "Synchronisation…" : "Synchroniser maintenant"}
                  </Btn>
                  <Btn variant="muted" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
                    {connectMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                    Reconnecter
                  </Btn>
                  <Btn variant="danger" disabled={resetMut.isPending} onClick={() => { if (window.confirm("Réinitialiser la connexion courtier ?\n\nTu devras recliquer Initialiser et relancer le portail OAuth.")) resetMut.mutate(); }}>
                    {resetMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Réinitialiser
                  </Btn>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Comptes liés ─────────────────────────────────────── */}
      {(accounts.length > 0 || accountsQ.isFetching) && (
        <div>
          <div className="section-rule mb-5 flex items-center justify-between gap-4">
            <span>COMPTES WEALTHSIMPLE</span>
            <button
              onClick={() => refreshMut.mutate()}
              disabled={refreshMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-lg transition-opacity"
              style={{
                background: "rgba(212,167,44,0.10)",
                border: "1px solid rgba(212,167,44,0.30)",
                color: refreshMut.isPending ? MUTED : ACCENT,
                cursor: refreshMut.isPending ? "not-allowed" : "pointer",
              }}
              title="Demande à SnapTrade de re-synchroniser les données depuis Wealthsimple (manuel — peut être facturé selon ton plan)"
            >
              {refreshMut.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
              {refreshMut.isPending ? "Rafraîchissement…" : "Rafraîchir les soldes"}
            </button>
          </div>

          {accountsQ.isFetching && accounts.length === 0 && (
            <div className="flex items-center gap-2 text-sm" style={{ color: MUTED }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement des comptes…
            </div>
          )}

          <div className="space-y-3">
            {accounts.map((acc, i) => {
              const accId = acc.id ?? String(i);
              const isExpanded = expandedId === accId;
              return (
                <div key={accId} className="rounded-xl p-4 transition-all" style={{ background: SURFACE, border: `1px solid ${isExpanded ? "rgba(212,167,44,0.25)" : BORDER}` }}>
                  <button
                    className="w-full flex items-center justify-between gap-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : accId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Building2 className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: "#E8E9ED" }}>
                          {acc.name ?? acc.number ?? "Compte"}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                          {acc.institution_name ?? acc.brokerage?.name ?? acc.meta?.institution_name ?? "Wealthsimple"}
                          {(acc.meta?.unifiedAccountType ?? acc.type) && <> · {acc.meta?.unifiedAccountType ?? acc.type}</>}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] shrink-0 flex items-center gap-1" style={{ color: ACCENT }}>
                      {isExpanded ? "Masquer" : "Voir le solde"}
                    </span>
                  </button>

                  {isExpanded && acc.id && (
                    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                      <AccountBalance accountId={acc.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Répartition du portefeuille ──────────────────────── */}
      <AllocationSection />

      {/* ── Ordres stop de protection ────────────────────────── */}
      <StopOrdersSection />

      {/* ── Statut API compact (bas de page) ─────────────────── */}
      {s && (
        <div className="rounded-xl px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-4 text-[11px]" style={{ background: BASE_BG, border: `1px solid ${BORDER}` }}>
          <div>
            <div className="uppercase tracking-[0.15em] mb-1" style={{ color: MUTED }}>Statut</div>
            {s.status === "connected" && <span className="flex items-center gap-1" style={{ color: "#16A34A" }}><CheckCircle2 className="w-3.5 h-3.5" />Connecté</span>}
            {s.status === "pending"   && <span className="flex items-center gap-1" style={{ color: "#F59E0B" }}><AlertTriangle className="w-3.5 h-3.5" />En attente</span>}
            {s.status === "not_setup" && <span className="flex items-center gap-1" style={{ color: MUTED }}><XCircle className="w-3.5 h-3.5" />Non configuré</span>}
            {s.status === "error"     && <span className="flex items-center gap-1" style={{ color: "#DC2626" }}><XCircle className="w-3.5 h-3.5" />Erreur</span>}
          </div>
          <div>
            <div className="uppercase tracking-[0.15em] mb-1" style={{ color: MUTED }}>Clés API</div>
            {s.hasCredentials
              ? <span className="flex items-center gap-1" style={{ color: "#16A34A" }}><CheckCircle2 className="w-3.5 h-3.5" />Présentes</span>
              : <span className="flex items-center gap-1" style={{ color: "#F59E0B" }}><AlertTriangle className="w-3.5 h-3.5" />Absentes</span>}
          </div>
          {s.apiOk != null && (
            <div>
              <div className="uppercase tracking-[0.15em] mb-1" style={{ color: MUTED }}>API SnapTrade</div>
              {s.apiOk
                ? <span className="flex items-center gap-1" style={{ color: "#16A34A" }}><Wifi className="w-3.5 h-3.5" />En ligne</span>
                : <span className="flex items-center gap-1" style={{ color: "#DC2626" }}><WifiOff className="w-3.5 h-3.5" />Hors ligne</span>}
            </div>
          )}
          {s.lastSyncedAt && (
            <div>
              <div className="uppercase tracking-[0.15em] mb-1" style={{ color: MUTED }}>Dernière synchro</div>
              <span style={{ color: "#E8E9ED" }}>{new Date(s.lastSyncedAt).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
