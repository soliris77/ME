/**
 * Section « Répartition » de la page Courtier.
 * Trois vues : par secteur, par devise, espèces vs investi.
 * Données de GET /api/broker/allocation (positions SnapTrade + secteurs Yahoo).
 * Tous les montants sont marqués `.sensitive` (mode confidentialité).
 */
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Loader2, PieChart as PieIcon, AlertTriangle, RefreshCw, Wallet } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SURFACE = "#131722";
const BASE_BG = "#0B0E14";
const BORDER = "#232838";
const MUTED = "#8B92A5";
const ACCENT = "#D4A72C";
const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: "tabular-nums" };

const SECTOR_COLORS = [
  "#D4A72C", "#3B82F6", "#16A34A", "#8B5CF6", "#EC4899",
  "#F97316", "#06B6D4", "#EAB308", "#EF4444", "#84CC16",
  "#6366F1", "#14B8A6",
];

const SECTOR_FR: Record<string, string> = {
  "Technology": "Technologie",
  "Financial Services": "Services financiers",
  "Healthcare": "Santé",
  "Consumer Cyclical": "Consommation cyclique",
  "Consumer Defensive": "Consommation de base",
  "Energy": "Énergie",
  "Industrials": "Industrie",
  "Basic Materials": "Matériaux",
  "Communication Services": "Communications",
  "Utilities": "Services publics",
  "Real Estate": "Immobilier",
};

interface Allocation {
  connected: boolean;
  reason?: string;
  message?: string;
  error?: string;
  empty?: boolean;
  asOf?: string;
  fxWarning?: string | null;
  accountErrors?: { accountId: string; name: string | null; error: string }[];
  totals?: { investedCad: number; cashCad: number; totalCad: number; cashPct: number };
  bySector?: { sector: string; valueCad: number; weightPct: number; symbols: string[] }[];
  byCurrency?: { currency: string; invested: number; cash: number; total: number; totalCad: number | null }[];
  positions?: { symbol: string; units: number; price: number; currency: string; value: number; valueCad: number | null; sector: string }[];
}

const fmtCad = (v: number) =>
  v.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function Donut({ data, centerLabel, centerValue }: {
  data: { name: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
}) {
  return (
    <div className="relative h-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="65%"
            outerRadius="95%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: MUTED }}>{centerLabel}</span>
        <span className="sensitive text-sm font-semibold mt-0.5" style={{ ...MONO, color: "#E8E9ED" }}>{centerValue}</span>
      </div>
    </div>
  );
}

function LegendRow({ color, label, value, pct }: { color: string; label: string; value: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
      <span className="flex-1 truncate" style={{ color: "#E8E9ED" }}>{label}</span>
      <span className="sensitive shrink-0" style={{ ...MONO, color: MUTED }}>{value}</span>
      <span className="shrink-0 w-11 text-right font-semibold" style={{ ...MONO, color: "#E8E9ED" }}>{pct.toFixed(1)} %</span>
    </div>
  );
}

export default function AllocationSection() {
  const q = useQuery<Allocation>({
    queryKey: ["broker-allocation"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/broker/allocation`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? `Erreur ${r.status}`);
      return data;
    },
    staleTime: 60_000,
    retry: false,
  });

  const a = q.data;

  return (
    <div>
      <div className="section-rule mb-5 flex items-center justify-between gap-4">
        <span>RÉPARTITION DU PORTEFEUILLE</span>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-lg"
          style={{ background: "rgba(212,167,44,0.10)", border: "1px solid rgba(212,167,44,0.30)", color: q.isFetching ? MUTED : ACCENT }}
        >
          {q.isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Actualiser
        </button>
      </div>

      {/* Chargement */}
      {q.isLoading && (
        <div className="flex items-center gap-2 text-sm rounded-xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: MUTED }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Calcul de la répartition…
        </div>
      )}

      {/* Erreur requête */}
      {q.isError && (
        <div className="flex items-start gap-3 rounded-xl p-5 text-[12px]" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.3)", color: "#DC2626" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>Impossible de calculer la répartition : {String((q.error as Error)?.message ?? q.error)}</div>
        </div>
      )}

      {/* Non connecté */}
      {a && !a.connected && (
        <div className="flex items-start gap-3 rounded-xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <PieIcon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: MUTED }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: "#E8E9ED" }}>Répartition indisponible</div>
            <p className="text-[11px] mt-1" style={{ color: MUTED }}>{a.message ?? "Courtier non connecté."}</p>
          </div>
        </div>
      )}

      {/* Connecté mais vide */}
      {a?.connected && a.empty && (
        <div className="flex items-start gap-3 rounded-xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <Wallet className="w-5 h-5 shrink-0 mt-0.5" style={{ color: MUTED }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: "#E8E9ED" }}>Aucune position ni liquidité</div>
            <p className="text-[11px] mt-1" style={{ color: MUTED }}>{a.message ?? "Ton compte ne contient encore ni titres ni espèces — rien à répartir."}</p>
          </div>
        </div>
      )}

      {/* Données */}
      {a?.connected && !a.empty && a.totals && (
        <div className="space-y-4">
          {/* Avertissements explicites */}
          {a.fxWarning && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B" }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{a.fxWarning}
            </div>
          )}
          {(a.accountErrors?.length ?? 0) > 0 && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B" }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Certains comptes n'ont pas pu être lus — la répartition est partielle ({a.accountErrors!.length} compte{a.accountErrors!.length > 1 ? "s" : ""} en erreur).
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Secteurs */}
            <div className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <div className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: MUTED }}>Par secteur</div>
              {(a.bySector?.length ?? 0) === 0 ? (
                <p className="text-[11px] mt-3" style={{ color: MUTED }}>Aucune position investie — tout est en espèces.</p>
              ) : (
                <>
                  <Donut
                    data={a.bySector!.map((s, i) => ({
                      name: SECTOR_FR[s.sector] ?? s.sector,
                      value: s.valueCad,
                      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
                    }))}
                    centerLabel="Investi"
                    centerValue={fmtCad(a.totals.investedCad)}
                  />
                  <div className="space-y-1.5 mt-2">
                    {a.bySector!.map((s, i) => (
                      <LegendRow
                        key={s.sector}
                        color={SECTOR_COLORS[i % SECTOR_COLORS.length]}
                        label={`${SECTOR_FR[s.sector] ?? s.sector} (${s.symbols.join(", ")})`}
                        value={fmtCad(s.valueCad)}
                        pct={s.weightPct}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Devises */}
            <div className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <div className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: MUTED }}>Par devise</div>
              <Donut
                data={(a.byCurrency ?? []).filter((c) => (c.totalCad ?? 0) > 0).map((c, i) => ({
                  name: c.currency,
                  value: c.totalCad ?? 0,
                  color: c.currency === "CAD" ? "#DC2626" : c.currency === "USD" ? "#3B82F6" : SECTOR_COLORS[(i + 4) % SECTOR_COLORS.length],
                }))}
                centerLabel="Total"
                centerValue={fmtCad(a.totals.totalCad)}
              />
              <div className="space-y-1.5 mt-2">
                {(a.byCurrency ?? []).map((c, i) => (
                  <LegendRow
                    key={c.currency}
                    color={c.currency === "CAD" ? "#DC2626" : c.currency === "USD" ? "#3B82F6" : SECTOR_COLORS[(i + 4) % SECTOR_COLORS.length]}
                    label={c.currency}
                    value={c.totalCad != null ? fmtCad(c.totalCad) : `${c.total.toLocaleString("fr-CA")} ${c.currency} (taux ?)`}
                    pct={a.totals!.totalCad > 0 && c.totalCad != null ? (c.totalCad / a.totals!.totalCad) * 100 : 0}
                  />
                ))}
              </div>
            </div>

            {/* Espèces vs investi */}
            <div className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <div className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: MUTED }}>Espèces vs investi</div>
              <Donut
                data={[
                  { name: "Investi", value: a.totals.investedCad, color: ACCENT },
                  { name: "Espèces", value: a.totals.cashCad, color: "#16A34A" },
                ].filter((d) => d.value > 0)}
                centerLabel="Espèces"
                centerValue={`${a.totals.cashPct.toFixed(1)} %`}
              />
              <div className="space-y-1.5 mt-2">
                <LegendRow color={ACCENT} label="Investi" value={fmtCad(a.totals.investedCad)} pct={a.totals.totalCad > 0 ? (a.totals.investedCad / a.totals.totalCad) * 100 : 0} />
                <LegendRow color="#16A34A" label="Espèces (non investies)" value={fmtCad(a.totals.cashCad)} pct={a.totals.cashPct} />
              </div>
              {a.totals.cashPct >= 20 && (
                <p className="text-[10px] mt-3 rounded-lg px-2.5 py-1.5" style={{ background: BASE_BG, border: `1px solid ${BORDER}`, color: MUTED }}>
                  💤 Plus de {Math.floor(a.totals.cashPct)} % de ton portefeuille dort en espèces.
                </p>
              )}
            </div>
          </div>

          {a.asOf && (
            <p className="text-[10px]" style={{ color: MUTED }}>
              Calculé le {new Date(a.asOf).toLocaleString("fr-CA")} — secteurs : Yahoo Finance (cache 24 h) · montants convertis en CAD.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
