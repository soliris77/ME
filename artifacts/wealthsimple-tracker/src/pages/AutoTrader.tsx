/**
 * Auto-Trader — Moteur de trading automatique
 * Surveille les signaux techniques en continu et exécute des ordres dès
 * que le score atteint le seuil configuré.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, Trash2, Power, PowerOff, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Shield, Bell, BellOff, Play, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Link } from "wouter";
import { formatPrice, formatPercent } from "@/lib/format";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────────── */
interface AutoTradeRule {
  id: number;
  symbol: string;
  name: string | null;
  enabled: boolean;
  sideMode: "buy" | "sell" | "both";
  minScore: number;
  quantity: string;
  accountId: string | null;
  stopLossPct: string | null;
  takeProfitPct: string | null;
  maxTradesPerDay: number;
  notifyOnSignal: boolean;
  cooldownMinutes: number;
  tradesToday: number;
  lastTriggeredAt: string | null;
  lastSignalScore: number | null;
  lastSignalVerdict: string | null;
  createdAt: string;
}

interface AutoTradeLog {
  id: number;
  ruleId: number;
  symbol: string;
  side: "BUY" | "SELL";
  triggerType: "order" | "notification_only" | "stop_loss" | "take_profit";
  signalScore: number | null;
  signalVerdict: string | null;
  price: string | null;
  quantity: string | null;
  orderId: number | null;
  notificationSent: boolean;
  notes: string | null;
  createdAt: string;
}

/* ── Design tokens ─────────────────────────────────────── */
const GAIN = "#16A34A";
const LOSS = "#DC2626";
const ACCENT = "#D4A72C";
const MUTED = "hsl(var(--muted-foreground))";

const SIDE_MODE_LABELS: Record<string, string> = {
  buy: "Achat seulement",
  sell: "Vente seulement",
  both: "Achat + Vente",
};

const VERDICT_COLOR: Record<string, string> = {
  "FORT ACHAT": GAIN,
  "ACHAT": "#4ade80",
  "NEUTRE": "hsl(var(--muted-foreground))",
  "VENTE": "#f87171",
  "FORTE VENTE": LOSS,
};

function scoreBar(score: number | null) {
  if (score === null) return null;
  const abs = Math.abs(score);
  const color = score >= 60 ? GAIN : score >= 20 ? "#4ade80" : score <= -60 ? LOSS : score <= -20 ? "#f87171" : MUTED;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${abs}%`, background: color }} />
      </div>
      <span className="text-[11px] font-mono" style={{ color }}>{score > 0 ? "+" : ""}{score}</span>
    </div>
  );
}

/* ── Rule Form Modal ────────────────────────────────────── */
interface RuleFormProps {
  rule?: AutoTradeRule | null;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  saving: boolean;
}

function RuleForm({ rule, onSave, onClose, saving }: RuleFormProps) {
  const [symbol, setSymbol] = useState(rule?.symbol ?? "");
  const [name, setName] = useState(rule?.name ?? "");
  const [sideMode, setSideMode] = useState<"buy" | "sell" | "both">(rule?.sideMode ?? "both");
  const [minScore, setMinScore] = useState(rule?.minScore ?? 60);
  const [quantity, setQuantity] = useState(parseFloat(rule?.quantity ?? "1"));
  const [stopLoss, setStopLoss] = useState(rule?.stopLossPct ? parseFloat(rule.stopLossPct) : 0);
  const [takeProfit, setTakeProfit] = useState(rule?.takeProfitPct ? parseFloat(rule.takeProfitPct) : 0);
  const [maxTrades, setMaxTrades] = useState(rule?.maxTradesPerDay ?? 3);
  const [notify, setNotify] = useState(rule?.notifyOnSignal ?? true);
  const [cooldown, setCooldown] = useState(rule?.cooldownMinutes ?? 240);

  const isEdit = !!rule;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      symbol: symbol.toUpperCase().trim(),
      name: name.trim() || null,
      sideMode,
      minScore,
      quantity,
      stopLossPct: stopLoss > 0 ? stopLoss : null,
      takeProfitPct: takeProfit > 0 ? takeProfit : null,
      maxTradesPerDay: maxTrades,
      notifyOnSignal: notify,
      cooldownMinutes: cooldown,
    });
  }

  const inputCls = "w-full rounded-lg px-3 py-2 text-[13px] bg-background border border-border/60 text-foreground focus:outline-none focus:border-primary/60 font-mono";
  const labelCls = "block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[500px] bg-card border border-border/60 rounded-xl overflow-hidden"
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.75)" }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <h2 className="text-[14px] font-bold text-foreground tracking-wide">
              {isEdit ? "Modifier la règle" : "Nouvelle règle auto-trade"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-[18px] leading-none">×</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Symbol + Nom */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Symbole *</label>
              <input className={inputCls} value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="AAPL" required />
            </div>
            <div>
              <label className={labelCls}>Nom (optionnel)</label>
              <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Apple achat fort" />
            </div>
          </div>

          {/* Direction */}
          <div>
            <label className={labelCls}>Direction des ordres</label>
            <div className="grid grid-cols-3 gap-2">
              {(["buy", "sell", "both"] as const).map((m) => (
                <button
                  key={m} type="button"
                  onClick={() => setSideMode(m)}
                  className={`py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wide border transition-colors ${
                    sideMode === m
                      ? m === "buy" ? "bg-green-500/15 border-green-500/50 text-green-400" :
                        m === "sell" ? "bg-red-500/15 border-red-500/50 text-red-400" :
                        "bg-primary/10 border-primary/40 text-primary"
                      : "border-border/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  {m === "buy" ? "🟢 Achat" : m === "sell" ? "🔴 Vente" : "↕ Les deux"}
                </button>
              ))}
            </div>
          </div>

          {/* Score minimum */}
          <div>
            <label className={labelCls}>Score minimum pour déclencher : <span className="text-primary font-mono">{minScore}</span>/100</label>
            <input type="range" min={20} max={100} step={5} value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-full accent-primary" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>20 — ACHAT</span><span>60 — FORT ACHAT ✓</span><span>100 — max</span>
            </div>
          </div>

          {/* Quantité + Cooldown */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantité (actions)</label>
              <input type="number" min={0.001} step="any" className={inputCls} value={quantity}
                onChange={e => setQuantity(parseFloat(e.target.value) || 1)} />
            </div>
            <div>
              <label className={labelCls}>Cooldown (minutes)</label>
              <input type="number" min={30} step={30} className={inputCls} value={cooldown}
                onChange={e => setCooldown(parseInt(e.target.value) || 240)} />
            </div>
          </div>

          {/* Stop-loss + Take-profit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Stop-Loss (%)</label>
              <input type="number" min={0} max={50} step={0.5} className={inputCls} value={stopLoss}
                onChange={e => setStopLoss(parseFloat(e.target.value) || 0)}
                placeholder="0 = désactivé" />
              <div className="text-[10px] text-muted-foreground mt-0.5">0 = désactivé</div>
            </div>
            <div>
              <label className={labelCls}>Take-Profit (%)</label>
              <input type="number" min={0} max={100} step={0.5} className={inputCls} value={takeProfit}
                onChange={e => setTakeProfit(parseFloat(e.target.value) || 0)}
                placeholder="0 = désactivé" />
              <div className="text-[10px] text-muted-foreground mt-0.5">0 = désactivé</div>
            </div>
          </div>

          {/* Max trades + Notify */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Max ordres/jour</label>
              <input type="number" min={1} max={20} step={1} className={inputCls} value={maxTrades}
                onChange={e => setMaxTrades(parseInt(e.target.value) || 3)} />
            </div>
            <div className="flex flex-col justify-end">
              <button
                type="button"
                onClick={() => setNotify(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-medium transition-colors ${
                  notify
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "border-border/40 text-muted-foreground"
                }`}
              >
                {notify ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                {notify ? "Notifier (SMS)" : "Sans notification"}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3 border-t border-border/60 pt-4">
          <button
            type="submit"
            disabled={saving || !symbol.trim()}
            className="flex-1 py-2.5 rounded-lg text-[13px] font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Enregistrement…" : isEdit ? "Modifier" : "Créer la règle"}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-[13px] text-muted-foreground border border-border/40 hover:border-border transition-colors">
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Rule Card ──────────────────────────────────────────── */
function RuleCard({
  rule,
  onToggle,
  onEdit,
  onDelete,
  logs,
}: {
  rule: AutoTradeRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  logs: AutoTradeLog[];
}) {
  const [expanded, setExpanded] = useState(false);
  const recentLogs = logs.filter(l => l.ruleId === rule.id).slice(0, 5);

  const lastTrigger = rule.lastTriggeredAt
    ? new Date(rule.lastTriggeredAt).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${
      rule.enabled ? "border-primary/20" : "border-border/40 opacity-70"
    }`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Enable/Disable toggle */}
        <button
          onClick={onToggle}
          title={rule.enabled ? "Désactiver" : "Activer"}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            rule.enabled ? "bg-green-500/15 text-green-400 hover:bg-green-500/25" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {rule.enabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
        </button>

        {/* Symbol + name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/quote/${encodeURIComponent(rule.symbol)}`}
              className="text-[14px] font-bold font-mono text-foreground hover:text-primary transition-colors">
              {rule.symbol}
            </Link>
            {rule.name && <span className="text-[11px] text-muted-foreground truncate">{rule.name}</span>}
            {!rule.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-mono">PAUSE</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              rule.sideMode === "buy" ? "bg-green-500/10 text-green-400" :
              rule.sideMode === "sell" ? "bg-red-500/10 text-red-400" :
              "bg-primary/10 text-primary"
            }`}>{SIDE_MODE_LABELS[rule.sideMode]}</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Score ≥ {rule.minScore} · {rule.quantity} action{parseFloat(rule.quantity) > 1 ? "s" : ""} · max {rule.maxTradesPerDay}/j
            </span>
          </div>
        </div>

        {/* Last signal score */}
        <div className="shrink-0 text-right hidden sm:block">
          {rule.lastSignalScore !== null && (
            <>
              <div className="text-[10px] text-muted-foreground mb-0.5">Signal actuel</div>
              {scoreBar(rule.lastSignalScore)}
              {rule.lastSignalVerdict && (
                <div className="text-[10px] font-mono mt-0.5" style={{ color: VERDICT_COLOR[rule.lastSignalVerdict] ?? MUTED }}>
                  {rule.lastSignalVerdict}
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} title="Modifier"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <Shield className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} title="Supprimer"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {rule.stopLossPct && (
          <span className="text-[10px] font-mono text-red-400/70">⛔ SL {rule.stopLossPct}%</span>
        )}
        {rule.takeProfitPct && (
          <span className="text-[10px] font-mono text-green-400/70">✅ TP {rule.takeProfitPct}%</span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground">
          <Clock className="w-2.5 h-2.5 inline mr-1 opacity-50" />
          Cooldown {rule.cooldownMinutes}min
        </span>
        {lastTrigger && (
          <span className="text-[10px] font-mono text-muted-foreground">Dernier : {lastTrigger}</span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground">
          Aujourd'hui : {rule.tradesToday}/{rule.maxTradesPerDay} ordres
        </span>
        {rule.notifyOnSignal
          ? <span className="text-[10px] font-mono text-primary/70"><Bell className="w-2.5 h-2.5 inline mr-0.5" />SMS</span>
          : <span className="text-[10px] font-mono text-muted-foreground/50"><BellOff className="w-2.5 h-2.5 inline mr-0.5" />Muet</span>
        }
      </div>

      {/* Expanded — recent logs */}
      {expanded && (
        <div className="border-t border-border/40 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Historique récent
          </div>
          {recentLogs.length === 0 ? (
            <div className="text-[11px] text-muted-foreground py-1">Aucune exécution pour le moment.</div>
          ) : (
            <div className="space-y-1.5">
              {recentLogs.map(log => (
                <div key={log.id} className="flex items-center gap-2 text-[11px]">
                  <span className={`font-mono font-bold shrink-0 ${log.side === "BUY" ? "text-green-400" : "text-red-400"}`}>
                    {log.side === "BUY" ? "🟢" : "🔴"} {log.side}
                  </span>
                  <span className="text-muted-foreground font-mono">
                    {log.quantity} @ {log.price ? parseFloat(log.price).toFixed(2) : "—"}$
                  </span>
                  <span className="text-muted-foreground/60 font-mono text-[10px]">
                    {log.triggerType === "order" ? "✅ Ordre" :
                     log.triggerType === "stop_loss" ? "⛔ Stop-loss" :
                     log.triggerType === "take_profit" ? "✅ Take-profit" : "📢 Notif."}
                  </span>
                  {log.signalScore !== null && (
                    <span className="font-mono text-[10px]" style={{ color: VERDICT_COLOR[log.signalVerdict ?? ""] ?? MUTED }}>
                      score {log.signalScore > 0 ? "+" : ""}{log.signalScore}
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground/50 text-[10px]">
                    {new Date(log.createdAt).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */
export default function AutoTrader() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<AutoTradeRule | null>(null);

  const rulesQ = useQuery<AutoTradeRule[]>({
    queryKey: ["auto-trade-rules"],
    queryFn: () => fetch(`${BASE}/api/auto-trader/rules`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const logsQ = useQuery<AutoTradeLog[]>({
    queryKey: ["auto-trade-logs"],
    queryFn: () => fetch(`${BASE}/api/auto-trader/logs?limit=100`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const rules: AutoTradeRule[] = Array.isArray(rulesQ.data) ? rulesQ.data : [];
  const logs: AutoTradeLog[] = Array.isArray(logsQ.data) ? logsQ.data : [];

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`${BASE}/api/auto-trader/rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-trade-rules"] }); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      fetch(`${BASE}/api/auto-trader/rules/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-trade-rules"] }); setEditRule(null); },
  });

  const toggleMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/auto-trader/rules/${id}/toggle`, { method: "PATCH" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-trade-rules"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/auto-trader/rules/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-trade-rules"] }),
  });

  const runMut = useMutation({
    mutationFn: () => fetch(`${BASE}/api/auto-trader/run`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => setTimeout(() => { qc.invalidateQueries({ queryKey: ["auto-trade-rules"] }); qc.invalidateQueries({ queryKey: ["auto-trade-logs"] }); }, 5000),
  });

  const enabledCount = rules.filter(r => r.enabled).length;
  const ordersToday = logs.filter(l => {
    const d = new Date(l.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString() && l.triggerType === "order";
  }).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Bot className="w-5 h-5 text-primary" />
            <h1 className="text-[20px] font-bold text-foreground tracking-tight">Auto-Trader</h1>
            {enabledCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] font-mono text-green-400">{enabledCount} active{enabledCount > 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground">
            Surveille les signaux techniques en continu · Passe des ordres automatiquement · Notifie par SMS
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border/50 text-[12px] text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            title="Forcer un cycle d'analyse immédiat"
          >
            {runMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Analyser maintenant
          </button>
          <button
            onClick={() => { setEditRule(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouvelle règle
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Règles actives", value: enabledCount, total: rules.length, icon: Bot, color: "text-primary" },
          { label: "Ordres aujourd'hui", value: ordersToday, icon: TrendingUp, color: "text-green-400" },
          { label: "Logs (30 derniers j)", value: logs.length, icon: CheckCircle2, color: "text-accent-foreground" },
        ].map(({ label, value, total, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
            </div>
            <div className="text-[22px] font-bold font-mono text-foreground">
              {value}{total !== undefined ? <span className="text-[14px] text-muted-foreground">/{total}</span> : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Warning banner */}
      <div className="mb-5 rounded-xl px-4 py-3 bg-yellow-500/5 border border-yellow-500/20 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-yellow-400/80 mt-0.5 shrink-0" />
        <div className="text-[11px] text-yellow-400/80 leading-relaxed">
          <strong>Avertissement de risque :</strong> L'auto-trading automatise des ordres réels sur les marchés financiers.
          Les pertes peuvent dépasser les gains. Utilise les stop-loss, les quotas journaliers et le mode Paper pour tester
          avant de passer en Live. <strong>Ce système n'est pas un conseil financier.</strong>
        </div>
      </div>

      {/* Rules list */}
      {rulesQ.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border/40 animate-pulse" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16">
          <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <div className="text-[14px] text-muted-foreground mb-1">Aucune règle d'auto-trading</div>
          <div className="text-[12px] text-muted-foreground/60 mb-4">Crée ta première règle pour commencer à trader automatiquement.</div>
          <button
            onClick={() => { setEditRule(null); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Créer une règle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              logs={logs}
              onToggle={() => toggleMut.mutate(rule.id)}
              onEdit={() => { setEditRule(rule); setShowForm(true); }}
              onDelete={() => { if (confirm(`Supprimer la règle "${rule.name ?? rule.symbol}" ?`)) deleteMut.mutate(rule.id); }}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <RuleForm
          rule={editRule}
          saving={createMut.isPending || updateMut.isPending}
          onClose={() => { setShowForm(false); setEditRule(null); }}
          onSave={(data) => {
            if (editRule) updateMut.mutate({ id: editRule.id, data });
            else createMut.mutate(data);
          }}
        />
      )}
    </div>
  );
}
