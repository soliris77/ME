import { useState, useMemo, useEffect, useRef } from "react";
import { X, Calculator, AlertTriangle, CheckCircle2, Info, TrendingUp } from "lucide-react";
import { suggestStopLoss, suggestTarget } from "@/lib/stopSuggestion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  defaultEntryPrice?: number;
  symbol?: string;
  /** Plus bas récent (ex. plus bas 20 jours) pour suggérer un stop-loss. */
  recentLow?: number;
  /** Libellé de la source du plus bas (ex. "plus bas 20 jours"). */
  recentLowLabel?: string;
  /** Plus haut récent (ex. plus haut 20 jours) pour suggérer un objectif de prix. */
  recentHigh?: number;
  /** Libellé de la source du plus haut (ex. "plus haut 20 jours"). */
  recentHighLabel?: string;
  /**
   * Appelé quand l'utilisateur veut acheter la quantité calculée.
   * Fourni uniquement lorsque le calculateur est ouvert depuis une fiche
   * de titre négociable — ouvre TradeModal (BUY) prérempli.
   */
  onBuy?: (units: number, stopPrice?: number) => void;
}

// ─── Résultat d'un champ affiché ──────────────────────────────────────────────

function ResultItem({
  label,
  value,
  sub,
  accent = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "gain" | "loss" | "neutral";
}) {
  const colorClass =
    accent === "primary" ? "text-primary" :
    accent === "gain"    ? "gain" :
    accent === "loss"    ? "loss" :
    "text-foreground";
  return (
    <div className="bg-muted/40 rounded-xl p-3 flex flex-col gap-0.5">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`font-mono font-bold text-lg leading-none ${colorClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export function PositionCalculator({ onClose, defaultEntryPrice, symbol, recentLow, recentLowLabel, recentHigh, recentHighLabel, onBuy }: Props) {
  const suggestion = useMemo(
    () => suggestStopLoss(defaultEntryPrice, recentLow, recentLowLabel),
    [defaultEntryPrice, recentLow, recentLowLabel]
  );
  const [capital,     setCapital]     = useState("10000");
  const [riskPct,     setRiskPct]     = useState("1");
  const [entryPrice,  setEntryPrice]  = useState(defaultEntryPrice?.toFixed(2) ?? "");
  const [stopPrice,   setStopPrice]   = useState(suggestion ? suggestion.value.toFixed(2) : "");
  const stopTouched = useRef(false);

  // Le plus bas 20 jours arrive de façon asynchrone : applique la suggestion
  // tant que l'utilisateur n'a pas modifié le champ lui-même.
  useEffect(() => {
    if (suggestion && !stopTouched.current) setStopPrice(suggestion.value.toFixed(2));
  }, [suggestion]);

  // Objectif de prix suggéré — dépend de l'entrée ET du stop courants (y compris
  // modifiés à la main) : le risque par action définit l'échelle de la récompense.
  const targetTouched = useRef(false);
  const targetSuggestion = useMemo(() => {
    const entry = parseFloat(entryPrice);
    const stop = parseFloat(stopPrice);
    return suggestTarget(
      Number.isFinite(entry) ? entry : undefined,
      Number.isFinite(stop) ? stop : undefined,
      recentHigh,
      recentHighLabel
    );
  }, [entryPrice, stopPrice, recentHigh, recentHighLabel]);
  const [targetPrice, setTargetPrice] = useState(targetSuggestion ? targetSuggestion.value.toFixed(2) : "");

  // Comme pour le stop : applique la suggestion tant que l'utilisateur n'a pas
  // modifié le champ lui-même (le plus haut 20 jours arrive de façon asynchrone).
  useEffect(() => {
    if (!targetTouched.current) setTargetPrice(targetSuggestion ? targetSuggestion.value.toFixed(2) : "");
  }, [targetSuggestion]);

  const calc = useMemo(() => {
    const cap    = parseFloat(capital);
    const risk   = parseFloat(riskPct) / 100;
    const entry  = parseFloat(entryPrice);
    const stop   = parseFloat(stopPrice);
    const target = parseFloat(targetPrice);

    if (!cap || !risk || !entry || !stop || isNaN(stop) || stop >= entry) return null;

    const riskPerShare   = Math.abs(entry - stop);
    const riskDollar     = cap * risk;
    const units          = Math.floor(riskDollar / riskPerShare);
    const totalPosition  = units * entry;
    const leverage       = totalPosition / cap;
    const actualRiskDollar = units * riskPerShare;

    let rrRatio: number | null = null;
    let rewardDollar: number | null = null;
    if (target && !isNaN(target) && target > entry) {
      const rewardPerShare = Math.abs(target - entry);
      rrRatio     = rewardPerShare / riskPerShare;
      rewardDollar = units * rewardPerShare;
    }

    return { units, riskDollar: actualRiskDollar, totalPosition, leverage, rrRatio, rewardDollar, riskPerShare };
  }, [capital, riskPct, entryPrice, stopPrice, targetPrice]);

  const stopErr = stopPrice && entryPrice && parseFloat(stopPrice) >= parseFloat(entryPrice);
  const rrQuality = calc?.rrRatio == null ? null : calc.rrRatio >= 3 ? "excellent" : calc.rrRatio >= 2 ? "good" : calc.rrRatio >= 1 ? "ok" : "poor";

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-card-border rounded-2xl w-full max-w-md shadow-2xl"
        style={{ boxShadow: "0 0 80px rgba(212,167,44,0.07), 0 32px 80px rgba(0,0,0,0.65)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
              <Calculator className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold brand-mark tracking-wide leading-none">
                Calculateur de position
              </h2>
              {symbol && (
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{symbol}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inputs */}
        <div className="px-6 py-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Capital total ($)
            </label>
            <input
              type="number" value={capital} onChange={(e) => setCapital(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              placeholder="10 000"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Risque max (% capital)
            </label>
            <div className="relative">
              <input
                type="number" value={riskPct} onChange={(e) => setRiskPct(e.target.value)}
                className="w-full pl-3 pr-7 py-2.5 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="1" step="0.1" min="0.1" max="10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Prix d'entrée ($)
            </label>
            <input
              type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              placeholder="0.00" step="0.01"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Stop-Loss ($)
              {stopErr && <span className="text-red-400 ml-1 normal-case font-normal">↑ doit être &lt; entrée</span>}
            </label>
            <input
              type="number" value={stopPrice}
              onChange={(e) => { stopTouched.current = true; setStopPrice(e.target.value); }}
              className={`w-full px-3 py-2.5 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 font-mono ${
                stopErr ? "border-red-500/50 focus:ring-red-500/30" : "border-input focus:ring-ring"
              }`}
              placeholder="0.00" step="0.01"
            />
            {suggestion && (
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Suggestion : <span className="font-mono">${suggestion.value.toFixed(2)}</span> ({suggestion.source})
              </p>
            )}
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Objectif de prix ($) <span className="normal-case font-normal opacity-60">— optionnel, pour le ratio R/R</span>
            </label>
            <input
              type="number" value={targetPrice}
              onChange={(e) => { targetTouched.current = true; setTargetPrice(e.target.value); }}
              className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              placeholder="0.00" step="0.01"
            />
            {targetSuggestion && (
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Suggestion : <span className="font-mono">${targetSuggestion.value.toFixed(2)}</span> ({targetSuggestion.source})
              </p>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="px-6 pb-5">
          {calc ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <ResultItem
                  label="Unités à acheter"
                  value={calc.units.toLocaleString("fr-CA")}
                  accent="primary"
                />
                <ResultItem
                  label="Risque en $"
                  value={`$${calc.riskDollar.toFixed(2)}`}
                  sub={`${parseFloat(riskPct).toFixed(1)}% du capital`}
                  accent="loss"
                />
                <ResultItem
                  label="Taille de position"
                  value={`$${calc.totalPosition.toLocaleString("fr-CA", { maximumFractionDigits: 0 })}`}
                  sub={`${((calc.totalPosition / parseFloat(capital)) * 100).toFixed(0)}% du capital`}
                />
                <ResultItem
                  label="Levier implicite"
                  value={`${calc.leverage.toFixed(2)}×`}
                  accent={calc.leverage > 2 ? "loss" : calc.leverage > 1 ? "neutral" : "gain"}
                />
              </div>

              {calc.rrRatio !== null && calc.rewardDollar !== null && (
                <div className="grid grid-cols-2 gap-2.5 border-t border-border/40 pt-2.5">
                  <ResultItem
                    label="Ratio Risque/Récompense"
                    value={`1 : ${calc.rrRatio.toFixed(2)}`}
                    accent={rrQuality === "excellent" ? "gain" : rrQuality === "good" ? "gain" : rrQuality === "ok" ? "neutral" : "loss"}
                    sub={rrQuality === "excellent" ? "Excellent" : rrQuality === "good" ? "Bon" : rrQuality === "ok" ? "Acceptable" : "Insuffisant"}
                  />
                  <ResultItem
                    label="Gain potentiel"
                    value={`+$${calc.rewardDollar.toFixed(2)}`}
                    accent="gain"
                  />
                </div>
              )}

              {/* Warnings / Tips */}
              {calc.leverage > 1 ? (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Levier &gt;1× — cette position dépasse ton capital disponible, typique d'un compte sur marge.</span>
                </div>
              ) : calc.rrRatio !== null && calc.rrRatio < 1.5 ? (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs text-red-400">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Ratio R/R inférieur à 1.5 — tu risques plus que tu ne peux potentiellement gagner sur ce trade.</span>
                </div>
              ) : calc.rrRatio !== null && calc.rrRatio >= 2 ? (
                <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Bon ratio R/R — ce setup respecte les règles de gestion du risque professionnelle.</span>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  Règle d'or : ne risquez jamais plus de 1–2% de votre capital par trade.
                </p>
              )}

              {/* Passer directement à l'ordre d'achat avec la quantité calculée */}
              {onBuy && calc.units > 0 && (
                <button
                  onClick={() => {
                    const stop = parseFloat(stopPrice);
                    onBuy(calc.units, Number.isFinite(stop) && stop > 0 ? stop : undefined);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]/50"
                  style={{ background: "rgba(22,163,74,0.15)", border: "1px solid rgba(22,163,74,0.35)", color: "#22c55e" }}
                >
                  <TrendingUp className="w-4 h-4" />
                  Acheter {calc.units.toLocaleString("fr-CA")} unité{calc.units > 1 ? "s" : ""}
                </button>
              )}
            </div>
          ) : (
            <div className="bg-muted/20 rounded-xl p-5 text-center border border-border/30">
              <Calculator className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Remplissez les 4 champs (Capital, Risque %, Entrée, Stop) pour voir le calcul.
              </p>
              {stopErr && (
                <p className="text-red-400 text-xs mt-1">⚠ Le stop-loss doit être inférieur au prix d'entrée (position longue).</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
