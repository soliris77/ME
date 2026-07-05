import { useMemo, useState } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Area, AreaChart,
} from "recharts";
import { computeIndicators, analyzeTradingSignals } from "@/lib/indicators";
import type { IndicatorPoint, OHLCPoint } from "@/lib/indicators";
import { TrendingUp, TrendingDown, Minus, AlertCircle, ChevronDown, ChevronUp, BookOpen, X } from "lucide-react";

interface Props {
  history: OHLCPoint[];
  currentPrice: number;
  currency: string;
}

const SIGNAL_COLORS = {
  "FORT ACHAT":  { bg: "bg-emerald-500/15", text: "text-emerald-500", border: "border-emerald-500/30" },
  "ACHAT":       { bg: "bg-green-500/10",   text: "text-green-500",   border: "border-green-500/20" },
  "NEUTRE":      { bg: "bg-muted",           text: "text-muted-foreground", border: "border-border" },
  "VENTE":       { bg: "bg-orange-500/10",  text: "text-orange-500",  border: "border-orange-500/20" },
  "FORTE VENTE": { bg: "bg-red-500/15",     text: "text-red-600",     border: "border-red-500/30" },
};

type ActiveOverlay = "sma" | "ema" | "bb";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: 11,
  color: "hsl(var(--foreground))",
};

// Guide pour débutants
const BEGINNER_GUIDE = [
  {
    term: "RSI (Force Relative)",
    simple: "Jauge de fatigue",
    explain: "Imaginez un ressort qu'on tire trop fort. Au-dessus de 70, le prix est 'épuisé' vers le haut et risque de redescendre. En dessous de 30, il est 'épuisé' vers le bas et peut rebondir.",
    action: "En dessous de 30 → chercher à acheter. Au-dessus de 70 → prudence ou vendre.",
    color: "text-blue-500",
  },
  {
    term: "MACD",
    simple: "Détecteur de changement de tendance",
    explain: "Le MACD compare deux moyennes de vitesse du prix. Quand la ligne bleue croise vers le haut la ligne rouge, c'est souvent le début d'une hausse. L'inverse annonce une baisse.",
    action: "Croix bleue vers le haut → signal d'achat. Croix bleue vers le bas → signal de vente.",
    color: "text-violet-500",
  },
  {
    term: "Moyennes Mobiles (SMA/EMA)",
    simple: "Prix moyen lissé",
    explain: "La MM20 est la moyenne des 20 derniers jours de prix. Si le prix actuel est au-dessus, la tendance est haussière. La 'Croix dorée' (MM20 > MM50) est l'un des signaux les plus populaires chez les traders.",
    action: "Prix > MM20 et MM20 > MM50 → tendance haussière confirmée.",
    color: "text-emerald-500",
  },
  {
    term: "Bandes de Bollinger",
    simple: "Enveloppe élastique du prix",
    explain: "Ces bandes s'élargissent quand le marché est volatile et se resserrent quand il est calme. Quand le prix touche la bande du bas, il rebondit souvent vers le milieu. La bande du haut est une zone de résistance.",
    action: "Prix à la bande basse → rebond probable (achat). Prix à la bande haute → résistance (prudence).",
    color: "text-orange-500",
  },
];

function PriceTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }} className="font-semibold">{p.name} :</span>
          <span className="font-mono">${typeof p.value === "number" ? p.value.toFixed(2) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function RSITooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const val = payload[0]?.value;
  const zone = val < 30 ? "Survente (potentiel rebond)" : val > 70 ? "Surachat (risque de recul)" : "Zone neutre";
  const color = val < 30 ? "#22c55e" : val > 70 ? "#ef4444" : "hsl(var(--muted-foreground))";
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-mono font-bold">{val?.toFixed(1)}</p>
      <p style={{ color }} className="font-medium">{zone}</p>
    </div>
  );
}

function MACDTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }} className="font-semibold">{p.name} :</span>
          <span className="font-mono">{typeof p.value === "number" ? p.value.toFixed(4) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function BeginnerGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Guide des indicateurs — Pour débutants</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {BEGINNER_GUIDE.map((g) => (
            <div key={g.term} className="border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-bold ${g.color}`}>{g.term}</span>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{g.simple}</span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed mb-2">{g.explain}</p>
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-primary">💡 Comment l'utiliser : {g.action}</p>
              </div>
            </div>
          ))}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">⚠️ Rappel important</p>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Aucun indicateur n'est parfait seul. Les meilleurs traders utilisent une <strong>combinaison</strong> d'indicateurs et attendent que plusieurs signaux s'alignent avant d'agir.
              Ne risquez jamais plus que vous ne pouvez vous permettre de perdre.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed, box }: { color: string; label: string; dashed?: boolean; box?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {box ? (
        <span className="w-3 h-2.5 rounded-sm inline-block" style={{ background: color }} />
      ) : (
        <span
          className="w-5 inline-block rounded"
          style={{ background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : undefined, height: dashed ? 0 : "2px" }}
        />
      )}
      {label}
    </div>
  );
}

export default function TechnicalAnalysis({ history, currentPrice }: Props) {
  const [overlays, setOverlays] = useState<Set<ActiveOverlay>>(new Set(["sma"]));
  const [showDetails, setShowDetails] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const data: IndicatorPoint[] = useMemo(() => computeIndicators(history), [history]);
  const analysis = useMemo(() => analyzeTradingSignals(data, currentPrice), [data, currentPrice]);

  const toggleOverlay = (o: ActiveOverlay) => {
    setOverlays((prev) => {
      const next = new Set(prev);
      next.has(o) ? next.delete(o) : next.add(o);
      return next;
    });
  };

  if (history.length < 20) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6 flex items-center gap-3 text-muted-foreground text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Pas assez de données pour l'analyse technique. Sélectionnez une période plus longue (1m ou plus).
      </div>
    );
  }

  const colors = SIGNAL_COLORS[analysis.overall] ?? SIGNAL_COLORS["NEUTRE"];
  const overallIcon =
    analysis.overall.includes("ACHAT") ? <TrendingUp className="w-5 h-5" /> :
    analysis.overall.includes("VENTE") ? <TrendingDown className="w-5 h-5" /> :
    <Minus className="w-5 h-5" />;

  const scoreWidth = `${Math.abs(analysis.score)}%`;
  const scoreIsPos = analysis.score >= 0;
  const border = "hsl(var(--border))";
  const mutedFg = "hsl(var(--muted-foreground))";
  const font = 10;
  const yDomain: [string, string] = ["auto", "auto"];

  return (
    <div className="space-y-4">
      {showGuide && <BeginnerGuide onClose={() => setShowGuide(false)} />}

      {/* Résumé débutant */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
        <p className="text-sm text-foreground/80 leading-relaxed flex-1">{analysis.beginnerSummary}</p>
        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0 mt-0.5"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Guide débutant
        </button>
      </div>

      {/* Signal global */}
      <div className={`rounded-xl border p-5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`flex items-center gap-2 font-bold text-lg ${colors.text}`}>
              {overallIcon}
              {analysis.overall}
            </div>
            <p className="text-sm text-foreground/80 mt-1 max-w-lg">{analysis.recommendation}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground mb-1">Score de conviction</div>
            <div className={`text-2xl font-bold font-mono ${colors.text}`}>
              {analysis.score > 0 ? "+" : ""}{analysis.score}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="relative h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="absolute inset-0 flex">
              <div className="flex-1 flex justify-end pr-px">
                {!scoreIsPos && (
                  <div className="h-full rounded-l-full bg-red-500" style={{ width: scoreWidth }} />
                )}
              </div>
              <div className="w-px bg-black/20 dark:bg-white/20" />
              <div className="flex-1 pl-px">
                {scoreIsPos && (
                  <div className="h-full rounded-r-full bg-emerald-500" style={{ width: scoreWidth }} />
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Forte vente</span><span>Neutre</span><span>Fort achat</span>
          </div>
        </div>

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium mt-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showDetails ? "Masquer les signaux" : `Voir les ${analysis.signals.length} signaux détaillés`}
        </button>

        {showDetails && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {analysis.signals.map((sig) => (
              <div key={sig.name} className="bg-background/60 border border-border/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{sig.name}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    sig.verdict === "buy" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                    sig.verdict === "sell" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{sig.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sig.description}</p>
                <p className="text-xs text-foreground/60 mt-1 leading-relaxed italic border-t border-border/40 pt-1">💡 {sig.beginnerTip}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Graphique prix + overlays */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">Prix &amp; Indicateurs</span>
          <div className="flex items-center gap-1.5">
            {(["sma", "ema", "bb"] as ActiveOverlay[]).map((o) => (
              <button
                key={o}
                onClick={() => toggleOverlay(o)}
                className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
                  overlays.has(o)
                    ? o === "sma" ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    : o === "ema" ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
                    : "bg-orange-500/20 text-orange-400 border-orange-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {o === "sma" ? "MM 20/50" : o === "ema" ? "EMA 12/26" : "Bollinger"}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={yDomain} tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} width={58} />
            <Tooltip content={<PriceTooltip />} />

            {overlays.has("bb") && (
              <>
                <Area dataKey="bbUpper" stroke="none" fill="hsl(38 100% 50% / 0.08)" connectNulls dot={false} name="Boll. Haut" legendType="none" />
                <Area dataKey="bbLower" stroke="none" fill="hsl(var(--background))" connectNulls dot={false} name="Boll. Bas" legendType="none" />
                <Line dataKey="bbUpper" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Boll. Haut" connectNulls />
                <Line dataKey="bbMiddle" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="2 2" dot={false} name="Boll. Mid" connectNulls />
                <Line dataKey="bbLower" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Boll. Bas" connectNulls />
              </>
            )}

            <Line dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Prix" connectNulls activeDot={{ r: 4, strokeWidth: 0 }} />

            {overlays.has("sma") && (
              <>
                <Line dataKey="sma20" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="MM20" connectNulls />
                <Line dataKey="sma50" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="MM50" connectNulls />
              </>
            )}

            {overlays.has("ema") && (
              <>
                <Line dataKey="ema12" stroke="#34d399" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="EMA12" connectNulls />
                <Line dataKey="ema26" stroke="#f87171" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="EMA26" connectNulls />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-3 mt-2 px-1">
          <LegendDot color="hsl(var(--primary))" label="Prix" />
          {overlays.has("sma") && <><LegendDot color="#60a5fa" label="MM 20 jours" /><LegendDot color="#a78bfa" label="MM 50 jours" /></>}
          {overlays.has("ema") && <><LegendDot color="#34d399" label="EMA 12" dashed /><LegendDot color="#f87171" label="EMA 26" dashed /></>}
          {overlays.has("bb") && <LegendDot color="hsl(38 100% 55%)" label="Bandes Bollinger" dashed />}
        </div>
      </div>

      {/* Volume */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <span className="text-sm font-semibold block mb-1">Volume des échanges</span>
        <p className="text-xs text-muted-foreground mb-3">Nombre d'actions/unités échangées sur la période. Un volume élevé confirme la force d'un mouvement.</p>
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={data} margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} width={52}
              tickFormatter={(v) => v >= 1e9 ? `${(v/1e9).toFixed(1)}G` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
            <Tooltip formatter={(v: number) => [v >= 1e9 ? `${(v/1e9).toFixed(2)}G` : v >= 1e6 ? `${(v/1e6).toFixed(2)}M` : v, "Volume"]} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="volume" fill="hsl(var(--primary) / 0.4)" radius={[2, 2, 0, 0]} name="Volume" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* RSI */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">RSI — Indice de force relative (14)</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-500 font-medium">30 = Survente</span>
            <span className="text-red-500 font-medium">70 = Surachat</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">En dessous de 30 : le prix a trop baissé, rebond possible. Au-dessus de 70 : le prix a trop monté, recul possible.</p>
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} ticks={[0, 30, 50, 70, 100]} width={30} />
            <Tooltip content={<RSITooltip />} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} label={{ value: "Surachat", position: "right", fontSize: 9, fill: "#ef4444" }} />
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 2" strokeWidth={1} label={{ value: "Survente", position: "right", fontSize: 9, fill: "#22c55e" }} />
            <ReferenceLine y={50} stroke={border} strokeDasharray="2 2" strokeWidth={1} />
            <Area dataKey="rsi" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#rsiGrad)" dot={false} name="RSI" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* MACD */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">MACD — Convergence/Divergence (12, 26, 9)</span>
          <div className="flex items-center gap-3 text-xs">
            <LegendDot color="#60a5fa" label="MACD" />
            <LegendDot color="#f87171" label="Signal" dashed />
            <LegendDot color="hsl(var(--muted-foreground))" label="Histogramme" box />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Ligne bleue croise vers le haut la rouge → signal d'achat. Vers le bas → signal de vente. L'histogramme montre la force du momentum.</p>
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => v.toFixed(2)} />
            <Tooltip content={<MACDTooltip />} />
            <ReferenceLine y={0} stroke={border} strokeWidth={1} />
            <Bar dataKey="macdHist" name="Histogramme" fill="hsl(var(--muted-foreground) / 0.4)" radius={[1, 1, 0, 0]} />
            <Line dataKey="macdLine" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="MACD" connectNulls />
            <Line dataKey="macdSignal" stroke="#f87171" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="Signal" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-muted/50 rounded-xl px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          ⚠️ <strong>Avertissement :</strong> Cette analyse est basée sur des indicateurs techniques historiques uniquement. Elle ne constitue pas un conseil financier.
          Les marchés sont imprévisibles — faites toujours vos propres recherches et ne risquez que ce que vous pouvez vous permettre de perdre.
        </p>
      </div>
    </div>
  );
}
