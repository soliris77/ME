/**
 * Auto-Trader — Moteur de trading automatique
 * Surveille les signaux techniques en continu et exécute des ordres dès
 * que le score atteint le seuil configuré.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip,
  ReferenceDot, CartesianGrid,
} from "recharts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, Trash2, Power, PowerOff, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Clock, Shield, Bell, BellOff, Play, ArrowUpRight, ArrowDownRight,
  FlaskConical, Briefcase, CalendarCheck, Scale, ShieldAlert, ShieldCheck,
  Users, Link2, Lightbulb, Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { formatPrice, formatPercent } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import GlobalRiskPanel from "@/components/GlobalRiskPanel";
import { isTradeableSymbol, nonTradeableReason } from "@/lib/tradeability";

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
  trailingStopPct: string | null;
  highWaterMark: string | null;
  sizingMode: "fixed" | "risk";
  riskAmount: string | null;
  confirmWeekly: boolean;
  maxTradesPerDay: number;
  notifyOnSignal: boolean;
  cooldownMinutes: number;
  aiReview: boolean;
  tradesToday: number;
  lastTriggeredAt: string | null;
  lastSignalScore: number | null;
  lastSignalVerdict: string | null;
  openEntryPrice: string | null;
  openQuantity: string | null;
  openSince: string | null;
  createdAt: string;
}

interface BacktestResult {
  symbol: string;
  years: number;
  months?: number | null;
  chartHistory?: { date: string; close: number }[];
  totalTrades: number;
  longTrades: number;
  shortTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalReturnPct: number;
  avgWinPct: number | null;
  avgLossPct: number | null;
  maxDrawdownPct: number;
  buyHoldReturnPct: number;
  trades: { side: "long" | "short"; entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; pnlPct: number; exitReason: string; score: number }[];
}

interface AutoTradeLog {
  id: number;
  ruleId: number;
  symbol: string;
  side: "BUY" | "SELL";
  triggerType: "order" | "notification_only" | "stop_loss" | "take_profit" | "trailing_stop";
  signalScore: number | null;
  signalVerdict: string | null;
  price: string | null;
  quantity: string | null;
  orderId: number | null;
  notificationSent: boolean;
  notes: string | null;
  aiVerdict: string | null;
  aiReason: string | null;
  createdAt: string;
}

interface FollowedTrader {
  id: number;
  externalStrategyId: string;
  traderDisplayName: string | null;
}

interface CopyBinding {
  id: number;
  ruleId: number;
  followedTraderId: number;
  enabled: boolean;
  createdAt: string | null;
  ruleName: string | null;
  ruleSymbol: string | null;
  traderDisplayName: string | null;
  traderStrategyId: string | null;
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

/* ── Symbol Autocomplete ────────────────────────────────── */
interface SymbolSuggestion {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

function SymbolAutocomplete({
  value,
  onChange,
  inputCls,
}: {
  value: string;
  onChange: (symbol: string) => void;
  inputCls: string;
}) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const search = useCallback((q: string) => {
    if (!q || q.length < 1) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    fetch(`${BASE}/api/symbols/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then((data: SymbolSuggestion[]) => {
        setSuggestions(data);
        setOpen(data.length > 0);
        setHighlighted(-1);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [BASE]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase();
    setQuery(v);
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(v), 220);
  }

  function pick(s: SymbolSuggestion) {
    setQuery(s.symbol);
    onChange(s.symbol);
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && highlighted >= 0) { e.preventDefault(); pick(suggestions[highlighted]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  const TYPE_BADGE: Record<string, string> = {
    EQUITY: "Action",
    ETF: "ETF",
    CRYPTOCURRENCY: "Crypto",
    INDEX: "Indice",
    MUTUALFUND: "Fonds",
    FUTURE: "Futur",
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          className={inputCls + " pr-7"}
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder="AAPL, AMD, BTC-USD…"
          required
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-card border border-border/70 rounded-lg shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.symbol}
              type="button"
              onMouseDown={() => pick(s)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                highlighted === i ? "bg-primary/10" : "hover:bg-muted/40"
              }`}
            >
              <span className="font-mono font-bold text-[13px] text-foreground w-[72px] shrink-0">{s.symbol}</span>
              <span className="text-[11px] text-muted-foreground truncate flex-1">{s.name}</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground shrink-0">
                {TYPE_BADGE[s.type.toUpperCase()] ?? s.type}
              </span>
              {s.exchange && (
                <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">{s.exchange}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Rule Form Modal ────────────────────────────────────── */
// Prefill fourni par une « Suggestion de règle » (le formulaire s'ouvre pré-rempli,
// l'utilisateur confirme via le flux de création habituel).
interface RulePrefill {
  symbol: string;
  name: string;
  sideMode: "buy" | "sell" | "both";
  minScore: number;
  quantity: number;
  sizingMode: "fixed" | "risk";
  stopLossPct?: number;
  takeProfitPct?: number;
  trailingStopPct?: number;
  riskAmount?: number;
  maxTradesPerDay: number;
  cooldownMinutes: number;
  notifyOnSignal: boolean;
  aiReview: boolean;
}

interface RuleFormProps {
  rule?: AutoTradeRule | null;
  prefill?: RulePrefill | null;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  saving: boolean;
}

function RuleForm({ rule, prefill, onSave, onClose, saving }: RuleFormProps) {
  const [symbol, setSymbol] = useState(rule?.symbol ?? prefill?.symbol ?? "");
  const [name, setName] = useState(rule?.name ?? prefill?.name ?? "");
  const [sideMode, setSideMode] = useState<"buy" | "sell" | "both">(rule?.sideMode ?? prefill?.sideMode ?? "both");
  const [minScore, setMinScore] = useState(rule?.minScore ?? prefill?.minScore ?? 60);
  const [quantity, setQuantity] = useState(rule?.quantity ? parseFloat(rule.quantity) : (prefill?.quantity ?? 1));
  const [stopLoss, setStopLoss] = useState(rule?.stopLossPct ? parseFloat(rule.stopLossPct) : (prefill?.stopLossPct ?? 0));
  const [takeProfit, setTakeProfit] = useState(rule?.takeProfitPct ? parseFloat(rule.takeProfitPct) : (prefill?.takeProfitPct ?? 0));
  const [trailingStop, setTrailingStop] = useState(rule?.trailingStopPct ? parseFloat(rule.trailingStopPct) : (prefill?.trailingStopPct ?? 0));
  const [sizingMode, setSizingMode] = useState<"fixed" | "risk">(rule?.sizingMode ?? prefill?.sizingMode ?? "fixed");
  const [riskAmount, setRiskAmount] = useState(rule?.riskAmount ? parseFloat(rule.riskAmount) : (prefill?.riskAmount ?? 50));
  const [confirmWeekly, setConfirmWeekly] = useState(rule?.confirmWeekly ?? false);
  const [maxTrades, setMaxTrades] = useState(rule?.maxTradesPerDay ?? prefill?.maxTradesPerDay ?? 3);
  const [notify, setNotify] = useState(rule?.notifyOnSignal ?? prefill?.notifyOnSignal ?? true);
  const [cooldown, setCooldown] = useState(rule?.cooldownMinutes ?? prefill?.cooldownMinutes ?? 240);
  const [aiReview, setAiReview] = useState(rule?.aiReview ?? prefill?.aiReview ?? false);

  // Backtest inline
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);

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
      trailingStopPct: trailingStop > 0 ? trailingStop : null,
      sizingMode,
      riskAmount: sizingMode === "risk" && riskAmount > 0 ? riskAmount : null,
      confirmWeekly,
      maxTradesPerDay: maxTrades,
      notifyOnSignal: notify,
      cooldownMinutes: cooldown,
      aiReview,
    });
  }

  async function runBacktestNow() {
    if (!symbol.trim()) return;
    setBtLoading(true);
    setBtError(null);
    setBtResult(null);
    try {
      const r = await fetch(`${BASE}/api/auto-trader/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase().trim(),
          minScore,
          sideMode,
          stopLossPct: stopLoss > 0 ? stopLoss : null,
          takeProfitPct: takeProfit > 0 ? takeProfit : null,
          trailingStopPct: trailingStop > 0 ? trailingStop : null,
          years: 2,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setBtError(data.error ?? "Erreur de backtest"); return; }
      setBtResult(data as BacktestResult);
    } catch {
      setBtError("Le serveur ne répond pas");
    } finally {
      setBtLoading(false);
    }
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
              <SymbolAutocomplete value={symbol} onChange={setSymbol} inputCls={inputCls} />
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

          {/* Dimensionnement de position */}
          <div>
            <label className={labelCls}>Dimensionnement de la position</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button type="button" onClick={() => setSizingMode("fixed")}
                className={`py-2 rounded-lg text-[11px] font-semibold border transition-colors ${
                  sizingMode === "fixed" ? "bg-primary/10 border-primary/40 text-primary" : "border-border/40 text-muted-foreground hover:border-border"
                }`}>
                Quantité fixe
              </button>
              <button type="button" onClick={() => setSizingMode("risk")}
                className={`py-2 rounded-lg text-[11px] font-semibold border transition-colors flex items-center justify-center gap-1 ${
                  sizingMode === "risk" ? "bg-primary/10 border-primary/40 text-primary" : "border-border/40 text-muted-foreground hover:border-border"
                }`}>
                <Scale className="w-3 h-3" /> Par risque ($)
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {sizingMode === "fixed" ? (
                <div>
                  <label className={labelCls}>Quantité (actions)</label>
                  <input type="number" min={0.001} step="any" className={inputCls} value={quantity}
                    onChange={e => setQuantity(parseFloat(e.target.value) || 1)} />
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Montant risqué / trade ($)</label>
                  <input type="number" min={1} step={5} className={inputCls} value={riskAmount}
                    onChange={e => setRiskAmount(parseFloat(e.target.value) || 50)} />
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Quantité = risque ÷ (prix × SL%). Nécessite un Stop-Loss &gt; 0.
                  </div>
                </div>
              )}
              <div>
                <label className={labelCls}>Cooldown (minutes)</label>
                <input type="number" min={30} step={30} className={inputCls} value={cooldown}
                  onChange={e => setCooldown(parseInt(e.target.value) || 240)} />
              </div>
            </div>
            {sizingMode === "risk" && stopLoss <= 0 && (
              <div className="text-[10px] text-yellow-400/90 mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Le mode "Par risque" requiert un Stop-Loss — sinon la quantité fixe est utilisée.
              </div>
            )}
          </div>

          {/* Stop-loss + Take-profit + Trailing */}
          <div className="grid grid-cols-3 gap-3">
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
            <div>
              <label className={labelCls}>Trailing (%)</label>
              <input type="number" min={0} max={50} step={0.5} className={inputCls} value={trailingStop}
                onChange={e => setTrailingStop(parseFloat(e.target.value) || 0)}
                placeholder="0 = désactivé" />
              <div className="text-[10px] text-muted-foreground mt-0.5">suit le plus-haut</div>
            </div>
          </div>

          {/* Confirmation hebdomadaire */}
          <button
            type="button"
            onClick={() => setConfirmWeekly(v => !v)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[12px] font-medium transition-colors ${
              confirmWeekly ? "bg-primary/10 border-primary/40 text-primary" : "border-border/40 text-muted-foreground hover:border-border"
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="text-left flex-1">
              Confirmation hebdomadaire {confirmWeekly ? "activée" : "désactivée"}
              <span className="block text-[10px] opacity-70">Le signal 1 semaine doit pointer dans la même direction avant d'agir</span>
            </span>
          </button>

          {/* Second avis IA */}
          <button
            type="button"
            onClick={() => setAiReview(v => !v)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[12px] font-medium transition-colors ${
              aiReview ? "bg-primary/10 border-primary/40 text-primary" : "border-border/40 text-muted-foreground hover:border-border"
            }`}
          >
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span className="text-left flex-1">
              Second avis IA {aiReview ? "activé" : "désactivé"}
              <span className="block text-[10px] opacity-70">Une vérification intelligente intégrée (gratuite) analyse le contexte avant chaque ordre et peut bloquer un trade douteux.</span>
            </span>
          </button>

          {/* Backtest */}
          <div className="rounded-lg border border-border/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-foreground">Backtest — 2 ans de données</span>
              </div>
              <button
                type="button"
                onClick={runBacktestNow}
                disabled={btLoading || !symbol.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
              >
                {btLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Tester la stratégie
              </button>
            </div>
            {btError && <div className="text-[11px] text-red-400">{btError}</div>}
            {btResult && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Trades", value: String(btResult.totalTrades), color: "text-foreground",
                      sub: (btResult.shortTrades ?? 0) > 0 || sideMode !== "buy"
                        ? `${btResult.longTrades ?? btResult.totalTrades} achat · ${btResult.shortTrades ?? 0} vente`
                        : null },
                    { label: "Taux de réussite", value: btResult.winRate !== null ? `${(btResult.winRate * 100).toFixed(0)}%` : "—",
                      color: (btResult.winRate ?? 0) >= 0.5 ? "text-green-400" : "text-red-400" },
                    { label: "Rendement", value: `${btResult.totalReturnPct >= 0 ? "+" : ""}${btResult.totalReturnPct.toFixed(1)}%`,
                      color: btResult.totalReturnPct >= 0 ? "text-green-400" : "text-red-400" },
                    { label: "Gain moyen", value: btResult.avgWinPct !== null ? `+${btResult.avgWinPct.toFixed(1)}%` : "—", color: "text-green-400/80" },
                    { label: "Perte moyenne", value: btResult.avgLossPct !== null ? `${btResult.avgLossPct.toFixed(1)}%` : "—", color: "text-red-400/80" },
                    { label: "Drawdown max", value: `-${btResult.maxDrawdownPct.toFixed(1)}%`, color: "text-yellow-400/80" },
                  ].map(({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string | null }) => (
                    <div key={label} className="bg-background/50 rounded-lg px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
                      <div className={`text-[13px] font-mono font-bold ${color}`}>{value}</div>
                      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Comparaison achat-conservation : {btResult.buyHoldReturnPct >= 0 ? "+" : ""}{btResult.buyHoldReturnPct.toFixed(1)}%
                  {" · "}
                  {btResult.totalReturnPct > btResult.buyHoldReturnPct
                    ? <span className="text-green-400">la stratégie bat le marché ✓</span>
                    : <span className="text-yellow-400/80">l'achat-conservation aurait fait mieux</span>}
                </div>
                <div className="text-[9px] text-muted-foreground/60">
                  Performance passée ≠ résultats futurs. Simulation sans frais ni glissement.
                </div>
              </div>
            )}
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

/* ── Backtest Modal — rejoue la règle sur les 6 derniers mois ─────────────── */
function BacktestModal({ rule, onClose }: { rule: AutoTradeRule; onClose: () => void }) {
  const btQ = useQuery<BacktestResult & { error?: string }>({
    queryKey: ["auto-trade-backtest-6mo", rule.id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/auto-trader/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: rule.symbol,
          minScore: rule.minScore,
          sideMode: rule.sideMode,
          stopLossPct: rule.stopLossPct ? parseFloat(rule.stopLossPct) : null,
          takeProfitPct: rule.takeProfitPct ? parseFloat(rule.takeProfitPct) : null,
          trailingStopPct: rule.trailingStopPct ? parseFloat(rule.trailingStopPct) : null,
          months: 6,
          includeHistory: true,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erreur de backtest");
      return data as BacktestResult;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const result = btQ.data ?? null;
  const history = result?.chartHistory ?? [];

  // Index par date (YYYY-MM-DD) pour placer les marqueurs sur le graphique
  const dayKey = (iso: string) => iso.slice(0, 10);
  const historyByDay = new Map(history.map((p) => [dayKey(p.date), p]));
  const markers = (result?.trades ?? []).flatMap((t, i) => {
    const entryPt = historyByDay.get(dayKey(t.entryDate));
    const exitPt = historyByDay.get(dayKey(t.exitDate));
    const out: { x: string; y: number; kind: "entry" | "exit"; side: "long" | "short"; key: string }[] = [];
    if (entryPt) out.push({ x: entryPt.date, y: t.entryPrice, kind: "entry", side: t.side, key: `e${i}` });
    if (exitPt) out.push({ x: exitPt.date, y: t.exitPrice, kind: "exit", side: t.side, key: `x${i}` });
    return out;
  });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });

  const EXIT_LABELS: Record<string, string> = {
    stop_loss: "⛔ Stop-loss", take_profit: "✅ Take-profit",
    trailing_stop: "🔃 Trailing", signal: "↩ Signal inverse", end: "🏁 Fin de période",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[720px] bg-card border border-border/60 rounded-xl overflow-hidden"
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.75)" }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <h2 className="text-[14px] font-bold text-foreground tracking-wide">
              Backtest — {rule.symbol}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                6 derniers mois · règle « {rule.name ?? rule.symbol} » (score ≥ {rule.minScore}, {SIDE_MODE_LABELS[rule.sideMode]})
              </span>
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-[18px] leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {btQ.isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" /> Simulation en cours…
            </div>
          )}
          {btQ.isError && (
            <div className="flex items-center gap-2 py-8 justify-center text-[12px] text-red-400">
              <AlertTriangle className="w-4 h-4" /> {(btQ.error as Error).message}
            </div>
          )}

          {result && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "P&L simulé", value: `${result.totalReturnPct >= 0 ? "+" : ""}${result.totalReturnPct.toFixed(1)}%`,
                    color: result.totalReturnPct >= 0 ? "text-green-400" : "text-red-400" },
                  { label: "Trades", value: String(result.totalTrades), color: "text-foreground",
                    sub: `${result.longTrades} achat · ${result.shortTrades} vente` },
                  { label: "Taux de réussite", value: result.winRate !== null ? `${(result.winRate * 100).toFixed(0)}%` : "—",
                    color: (result.winRate ?? 0) >= 0.5 ? "text-green-400" : "text-red-400" },
                  { label: "Drawdown max", value: `-${result.maxDrawdownPct.toFixed(1)}%`, color: "text-yellow-400/80" },
                ].map(({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) => (
                  <div key={label} className="bg-background/50 rounded-lg px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
                    <div className={`text-[15px] font-mono font-bold ${color}`}>{value}</div>
                    {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
                  </div>
                ))}
              </div>

              {/* Chart */}
              {history.length > 0 && (
                <div className="rounded-lg border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Graphique 6 mois — entrées et sorties simulées
                    </span>
                    <span className="flex items-center gap-3 text-[9px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Entrée</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Sortie</span>
                    </span>
                  </div>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,146,165,0.12)" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmtDate}
                          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                          minTickGap={40}
                          axisLine={false} tickLine={false}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                          tickFormatter={(v: number) => v.toFixed(0)}
                          width={44}
                          axisLine={false} tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                          labelFormatter={(l) => new Date(String(l)).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })}
                          formatter={(v: number | string) => [`${Number(v).toFixed(2)} $`, "Clôture"]}
                        />
                        <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        {markers.map((m) => (
                          <ReferenceDot
                            key={m.key}
                            x={m.x} y={m.y}
                            r={4.5}
                            fill={m.kind === "entry" ? "#4ade80" : "#f87171"}
                            stroke="hsl(var(--card))"
                            strokeWidth={1.5}
                          />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Trades list */}
              {result.trades.length === 0 ? (
                <div className="text-[11px] text-muted-foreground text-center py-3">
                  Aucun trade déclenché sur la période — le score n'a jamais atteint le seuil de la règle.
                </div>
              ) : (
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 px-3 py-1.5 bg-background/50 text-[9px] uppercase tracking-wider text-muted-foreground">
                    <span>Sens</span><span>Entrée</span><span>Sortie</span><span>Raison</span><span className="text-right">P&L</span>
                  </div>
                  {result.trades.map((t, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 px-3 py-1.5 border-t border-border/30 text-[11px] font-mono items-center">
                      <span className={t.side === "long" ? "text-green-400" : "text-red-400"}>
                        {t.side === "long" ? "🟢 Achat" : "🔴 Vente"}
                      </span>
                      <span className="text-muted-foreground">{fmtDate(t.entryDate)} @ {t.entryPrice.toFixed(2)}$</span>
                      <span className="text-muted-foreground">{fmtDate(t.exitDate)} @ {t.exitPrice.toFixed(2)}$</span>
                      <span className="text-muted-foreground text-[10px]">{EXIT_LABELS[t.exitReason] ?? t.exitReason}</span>
                      <span className={`text-right font-bold ${t.pnlPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-muted-foreground">
                Comparaison achat-conservation : {result.buyHoldReturnPct >= 0 ? "+" : ""}{result.buyHoldReturnPct.toFixed(1)}%
                {" · "}
                {result.totalReturnPct > result.buyHoldReturnPct
                  ? <span className="text-green-400">la règle bat le marché ✓</span>
                  : <span className="text-yellow-400/80">l'achat-conservation aurait fait mieux</span>}
              </div>
              <div className="text-[9px] text-muted-foreground/60">
                Simulation pure (aucune écriture) — mêmes signaux que le moteur d'auto-trading, données quotidiennes.
                Performance passée ≠ résultats futurs. Sans frais ni glissement.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Rule Card ──────────────────────────────────────────── */
function RuleCard({
  rule,
  onToggle,
  onEdit,
  onDelete,
  onBacktest,
  logs,
}: {
  rule: AutoTradeRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBacktest: () => void;
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
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/quote/${encodeURIComponent(rule.symbol)}`}
              className="text-[14px] font-bold font-mono text-foreground hover:text-primary transition-colors">
              {rule.symbol}
            </Link>
            {rule.name && <span className="text-[11px] text-muted-foreground truncate">{rule.name}</span>}
            {!rule.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-mono">PAUSE</span>}
            {/* Badge disponibilité Wealthsimple */}
            {isTradeableSymbol(rule.symbol) ? (
              <span title="Disponible sur Wealthsimple"
                className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)" }}>
                <CheckCircle2 className="w-2.5 h-2.5" /> WS
              </span>
            ) : (
              <span title={nonTradeableReason(rule.symbol)}
                className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full cursor-help"
                style={{ background: "rgba(139,146,165,0.10)", color: "hsl(var(--muted-foreground))", border: "1px solid rgba(139,146,165,0.22)" }}>
                <XCircle className="w-2.5 h-2.5" /> Non WS
              </span>
            )}
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
          <button onClick={onBacktest} title="Backtester — rejouer la règle sur 6 mois"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
            <FlaskConical className="w-3.5 h-3.5" />
          </button>
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
        {rule.trailingStopPct && (
          <span className="text-[10px] font-mono text-blue-400/70">🔃 Trail {rule.trailingStopPct}%</span>
        )}
        {rule.sizingMode === "risk" && rule.riskAmount && (
          <span className="text-[10px] font-mono text-purple-400/70">
            <Scale className="w-2.5 h-2.5 inline mr-0.5 opacity-70" />
            Risque {parseFloat(rule.riskAmount).toFixed(0)} $/trade
          </span>
        )}
        {rule.confirmWeekly && (
          <span className="text-[10px] font-mono text-teal-400/70">
            <CalendarCheck className="w-2.5 h-2.5 inline mr-0.5 opacity-70" />
            Confirm. hebdo
          </span>
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
                <div key={log.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={`font-mono font-bold shrink-0 ${log.side === "BUY" ? "text-green-400" : "text-red-400"}`}>
                      {log.side === "BUY" ? "🟢" : "🔴"} {log.side}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {log.quantity} @ {log.price ? parseFloat(log.price).toFixed(2) : "—"}$
                    </span>
                    <span className="text-muted-foreground/60 font-mono text-[10px]">
                      {log.triggerType === "order" ? "✅ Ordre" :
                       log.triggerType === "stop_loss" ? "⛔ Stop-loss" :
                       log.triggerType === "trailing_stop" ? "🔃 Trailing-stop" :
                       log.triggerType === "take_profit" ? "✅ Take-profit" : "📢 Notif."}
                    </span>
                    {log.signalScore !== null && (
                      <span className="font-mono text-[10px]" style={{ color: VERDICT_COLOR[log.signalVerdict ?? ""] ?? MUTED }}>
                        score {log.signalScore > 0 ? "+" : ""}{log.signalScore}
                      </span>
                    )}
                    {log.aiVerdict && (
                      <span className={`font-mono text-[10px] ${log.aiVerdict === "block" ? "text-red-400" : "text-muted-foreground"}`}>
                        🤖 IA : {log.aiVerdict === "block" ? "bloqué" : "approuvé"}
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground/50 text-[10px]">
                      {new Date(log.createdAt).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {log.aiVerdict && log.aiReason && (
                    <div className={`text-xs pl-5 ${log.aiVerdict === "block" ? "text-red-400/80" : "text-muted-foreground/70"}`}>
                      {log.aiReason}
                    </div>
                  )}
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
/* ── Panneau des positions ouvertes avec P&L en direct ─────────────────────── */
function OpenPositionsPanel({ rules }: { rules: AutoTradeRule[] }) {
  const open = rules.filter(r => r.openQuantity && parseFloat(r.openQuantity) > 0 && r.openEntryPrice);
  const symbols = [...new Set(open.map(r => r.symbol))];

  const quotesQ = useQuery<{ symbol: string; price: number | null }[]>({
    queryKey: ["auto-trade-open-quotes", symbols.join(",")],
    queryFn: () => fetch(`${BASE}/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`).then(r => r.json()),
    enabled: symbols.length > 0,
    refetchInterval: 30_000,
  });
  const quotes: { symbol: string; price: number | null }[] = Array.isArray(quotesQ.data) ? quotesQ.data : [];

  if (open.length === 0) return null;

  const rows = open.map(r => {
    const entry = parseFloat(r.openEntryPrice!);
    const qty = parseFloat(r.openQuantity!);
    const price = quotes.find(q => q.symbol === r.symbol)?.price ?? null;
    const pnl = price !== null ? (price - entry) * qty : null;
    const pnlPct = price !== null && entry > 0 ? ((price - entry) / entry) * 100 : null;
    return { rule: r, entry, qty, price, pnl, pnlPct };
  });
  const totalPnl = rows.every(r => r.pnl === null) ? null : rows.reduce((s, r) => s + (r.pnl ?? 0), 0);

  return (
    <div className="mb-6 surface-glass border border-border/40 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2.5">
          <Briefcase className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Positions ouvertes ({open.length})
          </span>
        </div>
        {totalPnl !== null && (
          <span className={`text-[14px] font-mono font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} $
          </span>
        )}
      </div>
      <div className="space-y-2">
        {rows.map(({ rule, entry, qty, price, pnl, pnlPct }) => (
          <div key={rule.id} className="flex items-center justify-between gap-4 rounded-lg bg-background/40 border border-border/40 px-4 py-3 transition-colors hover:border-border/80">
            <div className="flex items-center gap-4 min-w-0">
              <span className="text-[14px] font-bold font-mono text-foreground tracking-tight">{rule.symbol}</span>
              <span className="text-[12px] text-muted-foreground/80 font-mono tracking-wide">
                {qty} × {entry.toFixed(2)} $
              </span>
              {rule.openSince && (
                <span className="text-[10px] text-muted-foreground/50 hidden md:inline tracking-wider uppercase font-semibold">
                  depuis {new Date(rule.openSince).toLocaleDateString("fr-CA")}
                </span>
              )}
              {rule.trailingStopPct && rule.highWaterMark && (
                <span className="text-[10px] text-blue-400/60 hidden lg:inline font-mono uppercase tracking-widest font-bold">
                  trail : {(parseFloat(rule.highWaterMark) * (1 - parseFloat(rule.trailingStopPct) / 100)).toFixed(2)} $
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-[13px] font-mono text-muted-foreground font-medium">
                {price !== null ? `${price.toFixed(2)} $` : "…"}
              </span>
              {pnl !== null && pnlPct !== null ? (
                <span className={`text-[13px] font-mono font-bold tracking-tight ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} $ ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground/50">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Source copy trading — liaisons règle ↔ trader suivi ─────────────────── */
function CopyBindingsCard({ rules }: { rules: AutoTradeRule[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [ruleId, setRuleId] = useState<number | "">("");
  const [traderId, setTraderId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  // Lit la réponse et LÈVE si le statut n'est pas 2xx — indispensable pour ne
  // jamais faire passer un échec (ex. désactivation refusée) pour un succès.
  async function jsonOrThrow(r: Response, fallback: string): Promise<unknown> {
    let data: unknown = null;
    try { data = await r.json(); } catch { /* corps vide / non-JSON */ }
    if (!r.ok) {
      const msg = (data as { error?: string } | null)?.error ?? fallback;
      throw new Error(msg);
    }
    return data;
  }

  const bindingsQ = useQuery<CopyBinding[]>({
    queryKey: ["auto-trade-copy-bindings"],
    queryFn: () => fetch(`${BASE}/api/auto-trader/copy-bindings`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const tradersQ = useQuery<FollowedTrader[]>({
    queryKey: ["copy-trading-followed-traders"],
    queryFn: () => fetch(`${BASE}/api/copy-trading/followed-traders`).then(r => r.json()),
  });

  const bindings: CopyBinding[] = Array.isArray(bindingsQ.data) ? bindingsQ.data : [];
  const traders: FollowedTrader[] = Array.isArray(tradersQ.data) ? tradersQ.data : [];

  const addMut = useMutation({
    mutationFn: async (body: { ruleId: number; followedTraderId: number }) => {
      const r = await fetch(`${BASE}/api/auto-trader/copy-bindings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return jsonOrThrow(r, "Erreur lors de l'ajout de la liaison");
    },
    onSuccess: () => {
      setError(null);
      setRuleId("");
      setTraderId("");
      qc.invalidateQueries({ queryKey: ["auto-trade-copy-bindings"] });
      toast({ title: "Liaison copy-trading créée" });
    },
    onError: (e: Error) => {
      setError(e.message);
      toast({ title: "Échec de l'ajout", description: e.message, variant: "destructive" });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const r = await fetch(`${BASE}/api/auto-trader/copy-bindings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      return jsonOrThrow(r, "Erreur lors de la mise à jour de la liaison");
    },
    // Rafraîchit systématiquement (succès comme échec) pour que l'UI reflète
    // l'état RÉEL du serveur : une désactivation refusée doit rester "Actif".
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["auto-trade-copy-bindings"] });
      toast({ title: vars.enabled ? "Liaison activée" : "Liaison désactivée" });
    },
    onError: (e: Error) => {
      qc.invalidateQueries({ queryKey: ["auto-trade-copy-bindings"] });
      toast({ title: "Échec de la mise à jour", description: e.message, variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/auto-trader/copy-bindings/${id}`, { method: "DELETE" });
      return jsonOrThrow(r, "Erreur lors de la suppression de la liaison");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto-trade-copy-bindings"] });
      toast({ title: "Liaison supprimée" });
    },
    onError: (e: Error) => {
      qc.invalidateQueries({ queryKey: ["auto-trade-copy-bindings"] });
      toast({ title: "Échec de la suppression", description: e.message, variant: "destructive" });
    },
  });

  const canAdd = ruleId !== "" && traderId !== "" && !addMut.isPending;
  const selectCls = "flex-1 min-w-0 rounded-lg px-3 py-2 text-[12px] bg-background border border-border/60 text-foreground focus:outline-none focus:border-primary/60";

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="w-4 h-4 text-primary" />
        <h3 className="text-[13px] font-bold text-foreground">Source copy trading</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
        Lie une règle d'auto-trading à un trader suivi : quand ce trader ouvre un trade sur le
        symbole de la règle, un ordre est soumis via le <strong>même pipeline de risque</strong>
        {" "}(coupe-circuit, quotas, heures de marché, tailles max). Sans liaison, rien ne change.
      </p>

      {/* Formulaire d'ajout */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <select
          className={selectCls}
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">Règle…</option>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.symbol}{r.name ? ` — ${r.name}` : ""}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={traderId}
          onChange={(e) => setTraderId(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">Trader suivi…</option>
          {traders.map((t) => (
            <option key={t.id} value={t.id}>
              {t.traderDisplayName ?? `Stratégie ${t.externalStrategyId}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => addMut.mutate({ ruleId: ruleId as number, followedTraderId: traderId as number })}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Lier
        </button>
      </div>

      {error && <div className="text-[11px] text-red-400 mb-2">{error}</div>}
      {traders.length === 0 && (
        <div className="text-[11px] text-muted-foreground/70 mb-2 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Aucun trader suivi — ajoute-en un dans la page Copy Trading.
        </div>
      )}

      {/* Liste des liaisons */}
      {bindings.length === 0 ? (
        <div className="text-[11px] text-muted-foreground/60 text-center py-3">
          Aucune liaison copy-trading. Le copy-trading et l'auto-trader fonctionnent indépendamment.
        </div>
      ) : (
        <div className="rounded-lg border border-border/40 overflow-hidden">
          {bindings.map((b) => (
            <div
              key={b.id}
              className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-3 px-3 py-2 border-t border-border/30 first:border-t-0 text-[12px] items-center"
            >
              <span className="font-mono font-semibold text-foreground truncate">
                {b.ruleSymbol ?? "?"}
                {b.ruleName ? <span className="text-muted-foreground font-sans font-normal"> · {b.ruleName}</span> : ""}
              </span>
              <span className="text-muted-foreground truncate flex items-center gap-1">
                <Users className="w-3 h-3 shrink-0" />
                {b.traderDisplayName ?? `Stratégie ${b.traderStrategyId ?? "?"}`}
              </span>
              <button
                type="button"
                onClick={() => toggleMut.mutate({ id: b.id, enabled: !b.enabled })}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
                  b.enabled
                    ? "bg-green-500/15 border-green-500/40 text-green-400"
                    : "border-border/40 text-muted-foreground hover:border-border"
                }`}
                title={b.enabled ? "Désactiver" : "Activer"}
              >
                {b.enabled ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                {b.enabled ? "Actif" : "Inactif"}
              </button>
              <button
                type="button"
                onClick={() => { if (confirm("Supprimer cette liaison copy-trading ?")) deleteMut.mutate(b.id); }}
                className="text-muted-foreground hover:text-red-400 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Suggestions de règles (moteur local gratuit) ───────── */
interface RuleSuggestion {
  id: string;
  kind: "protect" | "entry" | "concentration";
  title: string;
  explanation: string;
  prefill: RulePrefill;
}

const SUGGESTION_ICON: Record<RuleSuggestion["kind"], typeof Shield> = {
  protect: Shield,
  concentration: Scale,
  entry: TrendingUp,
};

function SuggestionsPanel({ onCreate }: { onCreate: (prefill: RulePrefill) => void }) {
  const suggestionsQ = useQuery<{ suggestions: RuleSuggestion[]; message: string | null }>({
    queryKey: ["auto-trade-suggestions"],
    queryFn: () => fetch(`${BASE}/api/auto-trader/suggestions`).then(r => r.json()),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const suggestions = Array.isArray(suggestionsQ.data?.suggestions) ? suggestionsQ.data!.suggestions : [];
  const message = suggestionsQ.data?.message ?? null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-primary" />
        <h2 className="text-[13px] font-bold text-foreground tracking-wide">Suggestions de règles</h2>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-mono">gratuit</span>
      </div>

      {suggestionsQ.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-28 rounded-xl bg-card border border-border/40 animate-pulse" />
          ))}
        </div>
      ) : suggestionsQ.isError ? (
        <div className="bg-card border border-border/50 rounded-xl p-4 text-[12px] text-muted-foreground">
          Impossible de charger les suggestions pour le moment.
        </div>
      ) : suggestions.length === 0 ? (
        <div className="surface-glass border border-border/40 rounded-xl p-4 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-muted-foreground/50 mt-0.5 shrink-0" />
          <p className="text-[12px] text-muted-foreground leading-relaxed tracking-wide">
            {message ?? "Aucune suggestion pour le moment."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {suggestions.map(s => {
            const Icon = SUGGESTION_ICON[s.kind] ?? Lightbulb;
            return (
              <div key={s.id} className="surface-glass border border-border/40 rounded-xl p-5 flex flex-col transition-all hover:border-primary/40 hover:bg-background/40">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  <h3 className="text-[13px] font-bold text-foreground leading-tight tracking-wide">{s.title}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed tracking-wide flex-1">{s.explanation}</p>
                <button
                  onClick={() => onCreate(s.prefill)}
                  className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[11px] font-bold tracking-widest uppercase hover:bg-primary/20 hover:border-primary/40 transition-colors self-start"
                >
                  <Plus className="w-3.5 h-3.5" />
                  CRÉER
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AutoTrader() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<AutoTradeRule | null>(null);
  const [prefill, setPrefill] = useState<RulePrefill | null>(null);
  const [backtestRule, setBacktestRule] = useState<AutoTradeRule | null>(null);

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

  const brokerStatusQ = useQuery<{ halted: boolean; haltedAt: string | null }>({
    queryKey: ["broker-status"],
    queryFn: () => fetch(`${BASE}/api/broker/status`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const resumeMut = useMutation({
    mutationFn: () => fetch(`${BASE}/api/broker/resume`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-status"] }),
  });

  const dailyPnlQ = useQuery<{ realizedPnL: number; maxDailyLossAmount: number | null; mode: string }>({
    queryKey: ["auto-trader-daily-pnl"],
    queryFn: () => fetch(`${BASE}/api/auto-trader/daily-pnl`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const rules: AutoTradeRule[] = Array.isArray(rulesQ.data) ? rulesQ.data : [];
  const logs: AutoTradeLog[] = Array.isArray(logsQ.data) ? logsQ.data : [];

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`${BASE}/api/auto-trader/rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto-trade-rules"] });
      qc.invalidateQueries({ queryKey: ["auto-trade-suggestions"] });
      setShowForm(false);
      setPrefill(null);
    },
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 lg:py-10 animate-fadeUp">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="section-rule mb-3 mt-1">
            <span className="text-primary/60 uppercase tracking-widest font-bold text-[10px]">Moteur de trading</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-[24px] font-semibold tracking-wide text-foreground brand-mark flex items-center gap-2.5">
              <Bot className="w-6 h-6 text-primary" />
              Auto-Trader
            </h1>
            {enabledCount > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-sm bg-green-500/10 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-green-400">{enabledCount} active{enabledCount > 1 ? "s" : ""}</span>
              </div>
            )}
            <GlobalRiskPanel />
          </div>
          <p className="text-[12px] text-muted-foreground tracking-wide max-w-lg">
            Moteur algorithmique surveillant vos règles de trading. Les signaux qualifiés exécutent des ordres autonomes avec gestion stricte du risque.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all hover:border-primary/40 disabled:opacity-50"
            title="Forcer un cycle d'analyse immédiat"
          >
            {runMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Analyser maintenant
          </button>
          <button
            onClick={() => { setEditRule(null); setPrefill(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-primary text-primary-foreground btn-sheen hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouvelle règle
          </button>
        </div>
      </div>

      {/* Kill-switch banner */}
      {brokerStatusQ.data?.halted && (
        <div className="mb-5 rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/25 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-[12px] text-red-400 leading-relaxed">
            <strong>Kill-switch actif — trading suspendu.</strong> Aucun ordre automatique ne sera passé
            {brokerStatusQ.data.haltedAt ? ` (depuis le ${new Date(brokerStatusQ.data.haltedAt).toLocaleString("fr-CA")})` : ""}.
            La limite de perte journalière se règle dans les <Link href="/parametres" className="underline font-semibold">Paramètres</Link>.
          </div>
          <button
            onClick={() => {
              if (window.confirm("Réactiver le trading ? Les ordres live seront de nouveau acceptés.")) resumeMut.mutate();
            }}
            disabled={resumeMut.isPending}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-[12px] font-semibold text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-60"
          >
            {resumeMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Réactiver le trading
          </button>
        </div>
      )}

      {/* Perte du jour vs limite (coupe-circuit) */}
      {dailyPnlQ.data?.maxDailyLossAmount != null && (() => {
        const { realizedPnL, maxDailyLossAmount } = dailyPnlQ.data;
        const loss = Math.max(0, -realizedPnL); // seule une perte nette compte
        const pct = Math.min(100, (loss / maxDailyLossAmount) * 100);
        const barColor = pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-yellow-500" : "bg-green-500";
        const textColor = pct >= 90 ? "text-red-400" : pct >= 60 ? "text-yellow-400" : "text-muted-foreground";
        return (
          <div className="mb-5 bg-card border border-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Perte du jour vs coupe-circuit
                </span>
              </div>
              <span className={`text-[12px] font-mono font-semibold ${textColor}`}>
                {realizedPnL >= 0
                  ? `+${realizedPnL.toFixed(2)} $ réalisé`
                  : `−${loss.toFixed(2)} $ / ${maxDailyLossAmount.toFixed(2)} $`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-border/40 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {pct >= 90
                ? "Attention : le coupe-circuit est sur le point de suspendre le trading."
                : pct >= 60
                  ? "La perte réalisée se rapproche de la limite configurée."
                  : "P&L réalisé des ventes du jour (appariement des lots) — le trading est suspendu si la perte dépasse la limite."}
            </p>
          </div>
        );
      })()}

      {/* Risque global — si tous les stops sautent */}
      <GlobalRiskPanel />

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

      {/* Positions ouvertes */}
      <OpenPositionsPanel rules={rules} />

      {/* Suggestions de règles (moteur local gratuit) */}
      <SuggestionsPanel onCreate={(p) => { setEditRule(null); setPrefill(p); setShowForm(true); }} />

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
            onClick={() => { setEditRule(null); setPrefill(null); setShowForm(true); }}
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
              onEdit={() => { setEditRule(rule); setPrefill(null); setShowForm(true); }}
              onBacktest={() => setBacktestRule(rule)}
              onDelete={() => { if (confirm(`Supprimer la règle "${rule.name ?? rule.symbol}" ?`)) deleteMut.mutate(rule.id); }}
            />
          ))}
        </div>
      )}

      {/* Source copy trading — liaisons règle ↔ trader suivi */}
      <div className="mt-6">
        <CopyBindingsCard rules={rules} />
      </div>

      {/* Modals */}
      {backtestRule && (
        <BacktestModal rule={backtestRule} onClose={() => setBacktestRule(null)} />
      )}
      {showForm && (
        <RuleForm
          rule={editRule}
          prefill={prefill}
          saving={createMut.isPending || updateMut.isPending}
          onClose={() => { setShowForm(false); setEditRule(null); setPrefill(null); }}
          onSave={(data) => {
            if (editRule) updateMut.mutate({ id: editRule.id, data });
            else createMut.mutate(data);
          }}
        />
      )}
    </div>
  );
}
