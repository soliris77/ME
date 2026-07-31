import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { formatPrice } from "@/lib/format";
import { useMemo, useEffect, useState } from "react";
import { loadJournal, computeJournalPnL } from "@/lib/journal";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  LineChart as LineChartIcon, TrendingUp, TrendingDown, Loader2, RefreshCw,
  Layers, Target, BarChart2, BookOpen, Trophy, AlertCircle,
  ShieldCheck, ShieldAlert, ShieldOff,
} from "lucide-react";
import { useCountUp } from "@/hooks/use-count-up";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types API ────────────────────────────────────────────────────────────────

interface PerformanceMetrics {
  mode: "paper" | "live" | "combined";
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  riskRewardRatio: number | null;
  totalPnl: number;
  maxDrawdown: number;
  openPositions: number;
}

interface PerformanceReport {
  paper: PerformanceMetrics;
  live: PerformanceMetrics;
  combined: PerformanceMetrics;
}

interface DisciplineTrade {
  symbol: string;
  mode: "paper" | "live";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  entryAt: string;
  closedAt: string;
  stopPrice: number | null;
  stopSource: "stop_order" | "auto_trader" | null;
  initialRisk: number | null;
  riskPct: number | null;
  realizedR: number | null;
  positionPct: number;
  score: number;
  reasons: string[];
}

interface DisciplineComponent {
  key: "stop" | "risk" | "size" | "rr";
  label: string;
  score: number | null;
  weight: number;
}

interface DisciplineReport {
  generatedAt: string;
  capitalBase: number;
  totalTrades: number;
  score: number | null;
  components: DisciplineComponent[];
  disciplinedTrades: number;
  undisciplinedTrades: number;
  trades: DisciplineTrade[];
}

// ─── API hook ─────────────────────────────────────────────────────────────────

function usePerformance() {
  return useQuery<PerformanceReport>({
    queryKey: ["performance-report"],
    queryFn: () => fetch(`${BASE}/api/performance`).then((r) => r.json()),
    refetchInterval: 60_000,
  });
}

function useDiscipline() {
  return useQuery<DisciplineReport>({
    queryKey: ["discipline-report"],
    queryFn: () => fetch(`${BASE}/api/performance/discipline`).then((r) => r.json()),
    refetchInterval: 60_000,
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}
function money(n: number | null): string {
  return n === null ? "—" : formatPrice(n);
}

// ─── Compteur animé ───────────────────────────────────────────────────────────

function AnimatedStatCard({
  label, value, raw, tone, sub,
}: {
  label: string;
  value: string;
  raw?: number;
  tone?: "gain" | "loss" | "neutral";
  sub?: string;
}) {
  const animated = useCountUp(raw ?? 0, 1000);
  const toneClass = tone === "gain" ? "gain" : tone === "loss" ? "loss" : "text-foreground";
  const displayValue = raw !== undefined
    ? (value.includes("%")
        ? `${animated.toFixed(1)}%`
        : value.includes("$")
          ? `$${Math.abs(animated).toFixed(0)}`
          : String(Math.round(animated)))
    : value;

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 hover:border-primary/20 transition-colors">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{label}</div>
      <div className={`text-xl font-mono font-bold ${toneClass}`}>{displayValue}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function StatCard({ label, value, tone, sub, sensitive }: { label: string; value: string; tone?: "gain" | "loss" | "neutral"; sub?: string; sensitive?: boolean }) {
  const toneClass = tone === "gain" ? "gain" : tone === "loss" ? "loss" : "text-foreground";
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 hover:border-primary/20 transition-colors">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{label}</div>
      <div className={`text-xl font-mono font-bold ${toneClass}${sensitive ? " sensitive" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

// ─── Win rate gauge (arc SVG) ─────────────────────────────────────────────────

function WinRateGauge({ rate }: { rate: number | null }) {
  const pctVal = rate === null ? 0 : Math.min(Math.max(rate * 100, 0), 100);
  const animated = useCountUp(pctVal, 1200);

  const R = 40, CX = 50, CY = 52;
  const circumference = Math.PI * R; // demi-cercle
  const offset = circumference * (1 - animated / 100);
  const color = pctVal >= 55 ? "#16a34a" : pctVal >= 45 ? "#d4a72c" : "#dc2626";

  return (
    <div className="flex flex-col items-center">
      <svg width={100} height={60} viewBox="0 0 100 60">
        {/* Track */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke="hsl(var(--border))" strokeWidth={8} strokeLinecap="round"
        />
        {/* Progress */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }}
        />
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize={16} fontWeight="bold" fill={color} fontFamily="JetBrains Mono, monospace">
          {rate === null ? "—" : `${animated.toFixed(1)}%`}
        </text>
      </svg>
      <span className="text-xs text-muted-foreground -mt-1">Taux de réussite</span>
    </div>
  );
}

// ─── Métriques API ────────────────────────────────────────────────────────────

function MetricsSection({ title, icon: Icon, metrics }: { title: string; icon: typeof TrendingUp; metrics: PerformanceMetrics }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-muted-foreground ml-1">
          {metrics.totalTrades} trade{metrics.totalTrades !== 1 ? "s" : ""} clôturé{metrics.totalTrades !== 1 ? "s" : ""}
          {metrics.openPositions > 0 && ` · ${metrics.openPositions} position${metrics.openPositions > 1 ? "s" : ""} ouverte${metrics.openPositions > 1 ? "s" : ""}`}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Taux de réussite" value={pct(metrics.winRate)} tone={metrics.winRate === null ? "neutral" : metrics.winRate >= 0.5 ? "gain" : "loss"} />
        <StatCard label="Gains / Pertes" value={`${metrics.wins}G / ${metrics.losses}P`} />
        <StatCard label="Gain moyen" value={money(metrics.avgWin)} tone="gain" sensitive />
        <StatCard label="Perte moyenne" value={metrics.avgLoss === null ? "—" : `-${formatPrice(metrics.avgLoss)}`} tone="loss" sensitive />
        <StatCard label="Ratio R/R" value={metrics.riskRewardRatio === null ? "—" : metrics.riskRewardRatio.toFixed(2)} />
        <StatCard
          label="P&L total"
          value={metrics.totalPnl >= 0 ? `+${formatPrice(metrics.totalPnl)}` : `-${formatPrice(Math.abs(metrics.totalPnl))}`}
          tone={metrics.totalPnl >= 0 ? "gain" : "loss"}
          sensitive
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">Drawdown max :</span>
        <span className="font-mono loss sensitive">-{formatPrice(metrics.maxDrawdown)}</span>
        <span className="opacity-60">(plus grande baisse depuis un sommet de P&L cumulé)</span>
      </div>
    </div>
  );
}

// ─── Score de discipline ──────────────────────────────────────────────────────

function DisciplineGauge({ score }: { score: number | null }) {
  const pctVal = score === null ? 0 : Math.min(Math.max(score, 0), 100);
  const animated = useCountUp(pctVal, 1200);
  const R = 40, CX = 50, CY = 52;
  const circumference = Math.PI * R;
  const offset = circumference * (1 - animated / 100);
  const color = pctVal >= 75 ? "#16a34a" : pctVal >= 50 ? "#d4a72c" : "#dc2626";

  return (
    <div className="flex flex-col items-center">
      <svg width={110} height={64} viewBox="0 0 100 60">
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke="hsl(var(--border))" strokeWidth={8} strokeLinecap="round" />
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${circumference}`} strokeDashoffset={`${offset}`}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize={17} fontWeight="bold" fill={color} fontFamily="JetBrains Mono, monospace">
          {score === null ? "—" : Math.round(animated)}
        </text>
      </svg>
      <span className="text-xs text-muted-foreground -mt-1">Score de discipline / 100</span>
    </div>
  );
}

function stopSourceLabel(t: DisciplineTrade): string {
  if (t.stopSource === "stop_order") return "ordre stop";
  if (t.stopSource === "auto_trader") return "règle auto-trader";
  return "aucun";
}

function DisciplineSection() {
  const q = useDiscipline();
  const data = q.data;

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement du score de discipline…
      </div>
    );
  }
  if (!data || !Array.isArray(data.trades)) {
    return <div className="text-sm text-destructive">Impossible de charger le score de discipline.</div>;
  }
  if (data.totalTrades === 0) {
    return (
      <div className="bg-card border border-card-border rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-3">
          <ShieldCheck className="w-6 h-6 text-primary/40" />
        </div>
        <p className="font-semibold mb-1">Aucun trade clôturé à évaluer</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Le score mesure, pour chaque aller-retour (achat + vente), si le stop, le risque
          initial et la taille de position respectaient votre plan de risque.
        </p>
      </div>
    );
  }

  const undisciplined = data.trades.filter((t) => t.reasons.length > 0);

  return (
    <div className="space-y-5">
      {/* Score global + décomposition */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col items-center justify-center py-5">
          <DisciplineGauge score={data.score} />
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            {data.disciplinedTrades}/{data.totalTrades} trade{data.totalTrades > 1 ? "s" : ""} discipliné{data.disciplinedTrades > 1 ? "s" : ""}
          </p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4 sm:col-span-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Décomposition du score</div>
          <div className="space-y-2.5">
            {data.components.map((c) => {
              const val = c.score ?? 0;
              const color = val >= 75 ? "#16a34a" : val >= 50 ? "#d4a72c" : "#dc2626";
              return (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{c.label} <span className="text-muted-foreground">· poids {c.weight} %</span></span>
                    <span className="font-mono font-bold" style={{ color }}>{c.score === null ? "—" : `${Math.round(val)}/100`}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${val}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Capital de référence : {formatPrice(data.capitalBase)} (exposition max des paramètres de risque).
          </p>
        </div>
      </div>

      {/* Trades indisciplinés */}
      {undisciplined.length > 0 ? (
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold uppercase tracking-wide">Trades indisciplinés</h3>
            <span className="text-xs text-muted-foreground ml-1">{undisciplined.length} sur {data.totalTrades}</span>
          </div>
          <div className="space-y-3">
            {undisciplined.slice(0, 10).map((t, i) => (
              <div key={i} className="border border-red-500/20 bg-red-500/4 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-mono font-bold text-sm">{t.symbol}</span>
                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase text-[10px]">{t.mode}</span>
                  <span className="text-muted-foreground">
                    {new Date(t.closedAt).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })} ·{" "}
                    {t.quantity} × {formatPrice(t.entryPrice)} → {formatPrice(t.exitPrice)}
                  </span>
                  <span className={`ml-auto font-mono font-bold sensitive ${t.pnl >= 0 ? "gain" : "loss"}`}>
                    {t.pnl >= 0 ? "+" : "-"}{formatPrice(Math.abs(t.pnl))}
                  </span>
                  <span className="font-mono text-muted-foreground">score {Math.round(t.score)}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {t.reasons.map((r, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                      <ShieldOff className="w-3.5 h-3.5 shrink-0 mt-[1px]" /> {r}
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Stop : {stopSourceLabel(t)}{t.stopPrice !== null ? ` @ ${formatPrice(t.stopPrice)}` : ""}
                  {t.riskPct !== null && ` · risque initial ${(t.riskPct * 100).toFixed(1)} % du capital`}
                  {t.realizedR !== null && ` · R réalisé ${t.realizedR.toFixed(2)}`}
                  {` · position ${(t.positionPct * 100).toFixed(1)} % du capital`}
                </div>
              </div>
            ))}
            {undisciplined.length > 10 && (
              <p className="text-xs text-muted-foreground">… et {undisciplined.length - 10} autre{undisciplined.length - 10 > 1 ? "s" : ""}.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/6 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
          <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
          Tous les trades clôturés respectent votre plan de risque. Continuez comme ça.
        </div>
      )}
    </div>
  );
}

// ─── Analyse locale du journal de trading ─────────────────────────────────────

function useJournalAnalytics() {
  const [data, setData] = useState<{
    equityCurve: { date: string; valeur: number }[];
    dayMap: Record<string, number>;
    bySymbol: { symbol: string; wins: number; losses: number; totalPnl: number; total: number }[];
    closedCount: number;
    openCount: number;
    winRate: number | null;
    totalPnlPct: number;
    bestTrade: { symbol: string; pnl: number } | null;
    worstTrade: { symbol: string; pnl: number } | null;
  } | null>(null);

  useEffect(() => {
    const all = loadJournal();
    const closed = all.filter((e) => e.closed && e.exitPrice !== undefined);
    const open   = all.filter((e) => !e.closed);

    if (closed.length === 0) {
      setData({ equityCurve: [], dayMap: {}, bySymbol: [], closedCount: 0, openCount: open.length, winRate: null, totalPnlPct: 0, bestTrade: null, worstTrade: null });
      return;
    }

    // Trier par date de sortie
    const sorted = [...closed].sort((a, b) => new Date(a.exitDate!).getTime() - new Date(b.exitDate!).getTime());

    // Courbe d'équité (rendement cumulé additif en %)
    let cumulative = 0;
    const equityCurve = [{ date: "Début", valeur: 0 }];
    let wins = 0;
    let bestTrade: { symbol: string; pnl: number } | null = null;
    let worstTrade: { symbol: string; pnl: number } | null = null;

    sorted.forEach((entry) => {
      const pnl = computeJournalPnL(entry, entry.exitPrice!);
      cumulative += pnl.pnlPct;
      if (pnl.isWin) wins++;
      if (bestTrade === null || pnl.pnlPct > bestTrade.pnl)  bestTrade  = { symbol: entry.symbol, pnl: pnl.pnlPct };
      if (worstTrade === null || pnl.pnlPct < worstTrade.pnl) worstTrade = { symbol: entry.symbol, pnl: pnl.pnlPct };
      const label = new Date(entry.exitDate!).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
      equityCurve.push({ date: label, valeur: Math.round(cumulative * 100) / 100 });
    });

    // Calendrier P&L (91 derniers jours)
    const today = new Date();
    const calStart = new Date(today); calStart.setDate(today.getDate() - 90);
    const dayMap: Record<string, number> = {};
    sorted.forEach((entry) => {
      const d = new Date(entry.exitDate!);
      if (d < calStart) return;
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = (dayMap[key] ?? 0) + computeJournalPnL(entry, entry.exitPrice!).pnlPct;
    });

    // Répartition par symbole (top 8)
    const symMap: Record<string, { wins: number; losses: number; totalPnl: number }> = {};
    sorted.forEach((entry) => {
      if (!symMap[entry.symbol]) symMap[entry.symbol] = { wins: 0, losses: 0, totalPnl: 0 };
      const pnl = computeJournalPnL(entry, entry.exitPrice!);
      if (pnl.isWin) symMap[entry.symbol].wins++;
      else           symMap[entry.symbol].losses++;
      symMap[entry.symbol].totalPnl += pnl.pnlPct;
    });
    const bySymbol = Object.entries(symMap)
      .map(([symbol, d]) => ({ symbol, ...d, total: d.wins + d.losses }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    setData({
      equityCurve,
      dayMap,
      bySymbol,
      closedCount: closed.length,
      openCount: open.length,
      winRate: wins / closed.length,
      totalPnlPct: cumulative,
      bestTrade,
      worstTrade,
    });
  }, []);

  return data;
}

// ─── Calendrier P&L (GitHub-style) ────────────────────────────────────────────

function PnLCalendar({ dayMap }: { dayMap: Record<string, number> }) {
  const WEEKS = 13;
  const today = new Date();

  // Générer une grille de 91 jours (13 semaines × 7)
  const days: { iso: string; pnl: number | null }[] = [];
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ iso, pnl: dayMap[iso] ?? null });
  }

  // Regrouper par semaine (colonnes)
  const weeks: { iso: string; pnl: number | null }[][] = [];
  let week: { iso: string; pnl: number | null }[] = [];
  days.forEach((d, i) => {
    week.push(d);
    if ((i + 1) % 7 === 0) { weeks.push(week); week = []; }
  });
  if (week.length > 0) weeks.push(week);

  const cellColor = (pnl: number | null) => {
    if (pnl === null) return "hsl(var(--muted) / 0.4)";
    if (pnl >= 3)  return "#16a34a";
    if (pnl >= 1)  return "#22c55e";
    if (pnl > 0)   return "#4ade80";
    if (pnl > -1)  return "#fca5a5";
    if (pnl > -3)  return "#ef4444";
    return "#dc2626";
  };

  const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div>
      <div className="flex gap-1 items-start">
        {/* Jour labels */}
        <div className="flex flex-col gap-1 pt-5 pr-1">
          {dayLabels.map((d) => (
            <div key={d} className="text-[9px] text-muted-foreground h-[11px] leading-none">{d}</div>
          ))}
        </div>
        {/* Grid */}
        <div className="flex gap-1">
          {weeks.map((wk, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {/* Month label (première cellule) */}
              <div className="text-[9px] text-muted-foreground h-4 leading-none text-center">
                {wi === 0 || new Date(wk[0].iso).getDate() <= 7
                  ? new Date(wk[0].iso).toLocaleDateString("fr-CA", { month: "short" })
                  : ""}
              </div>
              {wk.map((day) => (
                <div
                  key={day.iso}
                  title={day.pnl !== null
                    ? `${new Date(day.iso).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })} : ${day.pnl >= 0 ? "+" : ""}${day.pnl.toFixed(2)}%`
                    : new Date(day.iso).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}
                  className="w-[11px] h-[11px] rounded-sm cursor-default transition-transform hover:scale-125"
                  style={{ background: cellColor(day.pnl) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Légende */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground">Moins</span>
        {[null, 0.5, 1.5, 3, -0.5, -1.5, -3].map((v, i) => (
          <div key={i} className="w-[11px] h-[11px] rounded-sm" style={{ background: cellColor(v) }} />
        ))}
        <span className="text-[10px] text-muted-foreground">Plus</span>
      </div>
    </div>
  );
}

// ─── Section journal local ────────────────────────────────────────────────────

const DONUT_COLORS = ["#D4A72C","#22c55e","#3b82f6","#a855f7","#ef4444","#f97316","#06b6d4","#ec4899"];

function JournalAnalyticsSection() {
  const analytics = useJournalAnalytics();

  if (!analytics) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement du journal…
      </div>
    );
  }

  if (analytics.closedCount === 0) {
    return (
      <div className="bg-card border border-card-border rounded-2xl p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-8 h-8 text-primary/50" />
        </div>
        <p className="font-semibold text-foreground mb-1">Journal vide</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Ouvrez la fiche d'un titre, notez une décision dans le Journal de trading, puis clôturez-la pour voir vos statistiques apparaître ici.
        </p>
        {analytics.openCount > 0 && (
          <p className="text-xs text-primary mt-3">{analytics.openCount} position{analytics.openCount > 1 ? "s" : ""} ouverte{analytics.openCount > 1 ? "s" : ""} en attente de clôture</p>
        )}
      </div>
    );
  }

  const equityColor = (analytics.totalPnlPct ?? 0) >= 0 ? "#22c55e" : "#ef4444";
  const equityMin = Math.min(...analytics.equityCurve.map((d) => d.valeur));
  const equityMax = Math.max(...analytics.equityCurve.map((d) => d.valeur));

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-card-border rounded-xl p-4 col-span-2 sm:col-span-1 flex flex-col items-center justify-center py-5">
          <WinRateGauge rate={analytics.winRate} />
        </div>
        <AnimatedStatCard
          label="Trades clôturés"
          value={String(analytics.closedCount)}
          raw={analytics.closedCount}
        />
        <AnimatedStatCard
          label="Rendement cumulé"
          value={`${(analytics.totalPnlPct ?? 0) >= 0 ? "+" : ""}${(analytics.totalPnlPct ?? 0).toFixed(2)}%`}
          raw={analytics.totalPnlPct ?? 0}
          tone={(analytics.totalPnlPct ?? 0) >= 0 ? "gain" : "loss"}
        />
        <AnimatedStatCard
          label="Positions ouvertes"
          value={String(analytics.openCount)}
          raw={analytics.openCount}
          sub="dans le journal local"
        />
      </div>

      {/* Best / Worst trades */}
      {(analytics.bestTrade || analytics.worstTrade) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {analytics.bestTrade && (
            <div className="bg-emerald-500/6 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <Trophy className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Meilleur trade</p>
                <p className="font-mono font-bold text-emerald-500">
                  {analytics.bestTrade.symbol} &mdash; +{analytics.bestTrade.pnl.toFixed(2)}%
                </p>
              </div>
            </div>
          )}
          {analytics.worstTrade && (
            <div className="bg-red-500/6 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Pire trade</p>
                <p className="font-mono font-bold text-red-500">
                  {analytics.worstTrade.symbol} &mdash; {analytics.worstTrade.pnl.toFixed(2)}%
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Equity curve */}
      {analytics.equityCurve.length >= 2 && (
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold uppercase tracking-wide">Courbe d'équité</h3>
            <span className="text-xs text-muted-foreground ml-1">rendement cumulé (%) — journal local</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={analytics.equityCurve} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={equityColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={equityColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border) / 0.3)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false} tickLine={false} width={42} domain={[equityMin * 1.1, equityMax * 1.1]}
                tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Cumulé"]}
              />
              <Area dataKey="valeur" stroke={equityColor} strokeWidth={2} fill="url(#equityGrad)" dot={false}
                activeDot={{ r: 4, fill: equityColor, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* P&L calendar + donut row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Calendrier P&L */}
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold uppercase tracking-wide">Calendrier P&amp;L</h3>
            <span className="text-xs text-muted-foreground ml-1">13 dernières semaines</span>
          </div>
          <PnLCalendar dayMap={analytics.dayMap} />
        </div>

        {/* Donut par symbole */}
        {analytics.bySymbol.length > 0 && (
          <div className="bg-card border border-card-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <LineChartIcon className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wide">Activité par symbole</h3>
            </div>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={analytics.bySymbol} dataKey="total" cx="50%" cy="50%"
                    innerRadius={30} outerRadius={55} strokeWidth={0}>
                    {analytics.bySymbol.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: number, _: string, p: any) => [
                      `${v} trade${v > 1 ? "s" : ""} · ${(p.payload as { wins: number; losses: number; totalPnl: number; symbol: string }).wins}G/${(p.payload as { wins: number; losses: number; totalPnl: number; symbol: string }).losses}P · ${(p.payload as { wins: number; losses: number; totalPnl: number; symbol: string }).totalPnl >= 0 ? "+" : ""}${(p.payload as { wins: number; losses: number; totalPnl: number; symbol: string }).totalPnl.toFixed(1)}%`,
                      (p.payload as { symbol: string }).symbol,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                {analytics.bySymbol.map((s, i) => (
                  <div key={s.symbol} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="font-mono font-bold shrink-0">{s.symbol}</span>
                    <span className="text-muted-foreground truncate">{s.wins}G/{s.losses}P</span>
                    <span className={`ml-auto font-mono shrink-0 ${s.totalPnl >= 0 ? "gain" : "loss"}`}>
                      {s.totalPnl >= 0 ? "+" : ""}{s.totalPnl.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Performance() {
  usePageMeta("Performance — Soliris Market", "Taux de réussite, risque/récompense et drawdown, paper vs. live.");
  const q = usePerformance();
  const data = q.data;

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-fadeUp">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="section-rule mb-4"><span>PERFORMANCE</span></div>
          <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
            <LineChartIcon className="w-5 h-5 text-primary" />
            Dashboard de performance
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Métriques issues des ordres remplis (FIFO) et du journal de trading local.
            Comparez le mode paper et le mode live.
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

      {/* ── Section 1 : métriques API (ordres remplis) ── */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-primary rounded-full" />
          <h2 className="text-base font-semibold">Métriques des ordres (courtier)</h2>
        </div>

        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : !data ? (
          <div className="text-sm text-destructive">Impossible de charger les métriques de performance.</div>
        ) : data.combined.totalTrades === 0 ? (
          <div className="bg-card border border-card-border rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-3">
              <LineChartIcon className="w-6 h-6 text-primary/40" />
            </div>
            <p className="font-semibold mb-1">Aucun ordre clôturé</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Les métriques apparaîtront après le premier aller-retour (achat + vente) complété via le courtier.
            </p>
          </div>
        ) : (
          <>
            <MetricsSection title="Combiné (paper + live)" icon={Layers} metrics={data.combined} />
            <MetricsSection title="Mode paper" icon={TrendingUp} metrics={data.paper} />
            <MetricsSection title="Mode live" icon={TrendingDown} metrics={data.live} />
            {data.paper.totalTrades > 0 && data.live.totalTrades > 0 && (
              <div className="bg-primary/8 border border-primary/25 rounded-xl p-4 text-sm text-primary">
                Comparaison : taux de réussite paper {pct(data.paper.winRate)} vs. live {pct(data.live.winRate)} ·
                ratio R/R paper {data.paper.riskRewardRatio?.toFixed(2) ?? "—"} vs. live {data.live.riskRewardRatio?.toFixed(2) ?? "—"}.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 2 : score de discipline ── */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-1 h-5 bg-red-500 rounded-full" />
          <h2 className="text-base font-semibold">Score de discipline</h2>
          <span className="text-xs text-muted-foreground ml-1">— vos trades respectent-ils votre plan de risque ?</span>
        </div>
        <DisciplineSection />
      </div>

      {/* ── Section 3 : analyse du journal local ── */}
      <div>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-1 h-5 bg-emerald-500 rounded-full" />
          <h2 className="text-base font-semibold">Analyse du journal de trading local</h2>
          <span className="text-xs text-muted-foreground ml-1">— stockage navigateur uniquement</span>
        </div>
        <JournalAnalyticsSection />
      </div>
    </div>
  );
}
