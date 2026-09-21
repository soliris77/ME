import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  Gauge,
  Loader2,
  Lock,
  Power,
  Save,
  ShieldAlert,
  Unlock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function jsonOrThrow(response: Response): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload !== null && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

/* — Ce que /api/perps renvoie — */

interface PerpsConfig {
  venue: string;
  enabled: boolean;
  mode: "shadow" | "armed";
  riskFraction: number;
  maxLeverage: number;
  maxTotalLeverage: number;
  maxOpenPositions: number;
  maxTradesPerDay: number;
  maxDailyCostFraction: number;
  dailyLossLimitFraction: number;
  liquidationBuffer: number;
  minSampleSize: number;
  minShadowDecisions: number;
  assumedSlippagePerSide: number;
  assumedFundingPerTrade: number;
  assumedFixedCostUsd: number;
  shadowEquityUsd: number;
  armedAt: string | null;
  disarmedAt: string | null;
}

interface DayState {
  tradesToday: number;
  feesPaidTodayUsd: number;
  realizedPnlTodayUsd: number;
}

interface ArmingStatus {
  ok: boolean;
  blockers: string[];
  shadowDecisions: number;
  minShadowDecisions: number;
  measuredGrossEdge: number;
  roundTripFraction: number;
  credentialsPresent: boolean;
  walletAddress: string | null;
  venue: string;
  venueLabel: string;
  referenceNotionalUsd: number;
  assumedFixedCostUsd: number;
}

interface VenueRow {
  venue: string;
  label: string;
  roundTripFraction: number;
  notionalUsd: number;
  fixedCostUsdPerSide: number;
  credentialsPresent: boolean;
  maxTradesUnderBudget: number;
}

interface StateResponse {
  config: PerpsConfig;
  day: DayState;
  arming: ArmingStatus;
}

interface HyperliquidBalance {
  venue: "hyperliquid";
  usdcBalance: number;
  perpsUsdc: number;
  spotUsdc: number;
  availableMarginUsd: number;
  spotAvailableUsd: number;
  openPositions: number;
  walletAddress: string | null;
  updatedAt: string;
}

interface DecisionRow {
  id: number;
  symbol: string;
  side: string;
  mode: string;
  allowed: boolean;
  executed: boolean;
  refusals: string | null;
  holds: string | null;
  notionalUsd: string | null;
  effectiveLeverage: string | null;
  riskUsd: string | null;
  createdAt: string;
}

interface Verdict {
  allowed: boolean;
  execute: boolean;
  refusals: string[];
  holds: string[];
  reasons: string[];
  roundTripFraction: number;
  plan?: {
    size: number;
    notionalUsd: number;
    leverageToSet: number;
    effectiveLeverage: number;
    marginUsd: number;
    liquidationPrice: number;
    riskUsd: number;
    estimatedRoundTripUsd: number;
  };
}

const pct = (fraction: number, digits = 2): string =>
  `${(fraction * 100).toFixed(digits)} %`;

const usd = (value: number): string => `${value.toFixed(2)} $`;
const usdc = (value: number): string =>
  `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;

function shortAddress(address: string | null): string {
  if (!address) return "Adresse non disponible";
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}

/** Les champs numériques modifiables, avec ce qu'ils veulent dire. */
const FIELDS: ReadonlyArray<{
  key: keyof PerpsConfig;
  label: string;
  hint: string;
  step: string;
}> = [
  { key: "riskFraction", label: "Risque par trade", hint: "fraction du capital, 0.005 = 0,5 %", step: "0.001" },
  { key: "maxLeverage", label: "Levier max (position)", hint: "plafond applicatif", step: "0.5" },
  { key: "maxTotalLeverage", label: "Levier max (total)", hint: "somme des notionnels ÷ capital", step: "0.5" },
  { key: "maxOpenPositions", label: "Positions ouvertes max", hint: "entier", step: "1" },
  { key: "maxTradesPerDay", label: "Trades par jour max", hint: "entier", step: "1" },
  { key: "maxDailyCostFraction", label: "Budget de frais / jour", hint: "fraction du capital", step: "0.005" },
  { key: "dailyLossLimitFraction", label: "Coupe-circuit de perte", hint: "fraction du capital", step: "0.005" },
  { key: "liquidationBuffer", label: "Marge avant liquidation", hint: "la liquidation doit être k× plus loin que le stop", step: "0.5" },
  { key: "minSampleSize", label: "Échantillon minimal", hint: "trades mesurés exigés", step: "10" },
  { key: "minShadowDecisions", label: "Décisions fantômes exigées", hint: "avant de pouvoir armer", step: "10" },
  { key: "assumedSlippagePerSide", label: "Glissement supposé / côté", hint: "fraction, 0.0002 = 2 pdb", step: "0.0001" },
  { key: "assumedFundingPerTrade", label: "Funding supposé / trade", hint: "fraction du notionnel", step: "0.0001" },
  { key: "assumedFixedCostUsd", label: "Frais fixe / côté", hint: "en dollars, indépendant de la taille — le gaz on-chain", step: "0.05" },
  { key: "shadowEquityUsd", label: "Capital de référence (fantôme)", hint: "sert tant qu'aucun compte n'est branché", step: "100" },
];

export default function PerpsPage() {
  usePageMeta(
    "Perps & levier",
    "Contrats perpétuels : double serrure, coûts réels et journal des décisions.",
  );

  const qc = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // La plateforme regardée. Chaque plateforme a SA ligne de réglages, SES
  // décisions et SA serrure : changer d'onglet change tout l'écran.
  const [venue, setVenue] = useState("hyperliquid");

  const stateQ = useQuery<StateResponse>({
    queryKey: ["perps-state", venue],
    queryFn: () =>
      fetch(`${BASE}/api/perps/state?venue=${venue}`).then(jsonOrThrow) as Promise<StateResponse>,
  });

  const balanceQ = useQuery<HyperliquidBalance>({
    queryKey: ["hyperliquid-balance"],
    queryFn: () =>
      fetch(`${BASE}/api/perps/balance?venue=hyperliquid`).then(jsonOrThrow) as Promise<HyperliquidBalance>,
    enabled: venue === "hyperliquid",
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const decisionsQ = useQuery<{ decisions: DecisionRow[] }>({
    queryKey: ["perps-decisions", venue],
    queryFn: () =>
      fetch(`${BASE}/api/perps/decisions?limit=25&venue=${venue}`).then(jsonOrThrow) as Promise<{
        decisions: DecisionRow[];
      }>,
  });

  const venuesQ = useQuery<{ venues: VenueRow[] }>({
    queryKey: ["perps-venues"],
    queryFn: () =>
      fetch(`${BASE}/api/perps/venues`).then(jsonOrThrow) as Promise<{ venues: VenueRow[] }>,
  });

  const config = stateQ.data?.config ?? null;

  useEffect(() => {
    if (!config) return;
    const next: Record<string, string> = {};
    for (const field of FIELDS) next[field.key] = String(config[field.key]);
    setDraft(next);
  }, [stateQ.data]);

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ["perps-state"] });
    void qc.invalidateQueries({ queryKey: ["perps-decisions"] });
    void qc.invalidateQueries({ queryKey: ["perps-venues"] });
  };

  const post = async (path: string, body: unknown): Promise<unknown> => {
    setError(null);
    return fetch(`${BASE}/api/perps/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue, ...(body as Record<string, unknown>) }),
    }).then(jsonOrThrow);
  };

  const enableMut = useMutation({
    mutationFn: (enabled: boolean) => post("enable", { enabled }),
    onSuccess: refresh,
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  const armMut = useMutation({
    mutationFn: () => post("arm", { confirm: true }),
    onSuccess: () => {
      toast({ title: "Mode armé" });
      refresh();
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  const disarmMut = useMutation({
    mutationFn: () => post("disarm", {}),
    onSuccess: () => {
      toast({ title: "Retour en mode fantôme" });
      refresh();
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const body: Record<string, number | string> = { venue };
      for (const field of FIELDS) {
        const raw = draft[field.key];
        if (raw === undefined) continue;
        const n = Number(raw);
        if (Number.isFinite(n) && config && n !== Number(config[field.key])) {
          body[field.key] = n;
        }
      }
      setError(null);
      return fetch(`${BASE}/api/perps/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow);
    },
    onSuccess: () => {
      toast({ title: "Réglages enregistrés" });
      refresh();
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  const [sim, setSim] = useState({
    symbol: "BTC",
    side: "long",
    entryPrice: "100",
    stopPrice: "97",
    measuredGrossEdge: "0.006",
    sampleSize: "200",
  });
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const simulateMut = useMutation({
    mutationFn: async () => {
      const payload = (await post("simulate", {
        symbol: sim.symbol,
        side: sim.side,
        entryPrice: Number(sim.entryPrice),
        stopPrice: Number(sim.stopPrice),
        measuredGrossEdge: Number(sim.measuredGrossEdge),
        sampleSize: Number(sim.sampleSize),
      })) as { verdict: Verdict };
      return payload.verdict;
    },
    onSuccess: (v) => setVerdict(v),
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  if (stateQ.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
      </div>
    );
  }

  if (!config || !stateQ.data) {
    return (
      <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        Impossible de lire l'état des perps.
      </div>
    );
  }

  const { day, arming } = stateQ.data;
  const armed = config.mode === "armed";

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}


      {/* - Choix de la plateforme - */}
      <div className="flex flex-wrap items-center gap-2">
        {(venuesQ.data?.venues ?? []).map((v) => (
          <button
            key={v.venue}
            onClick={() => setVenue(v.venue)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${
              venue === v.venue
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border/60 text-muted-foreground hover:border-border hover:bg-muted/30"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {venue === "hyperliquid" && (
        <div className="surface-glass rounded-xl p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Solde Hyperliquid
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground/95">
                {balanceQ.isLoading
                  ? "Lecture…"
                  : balanceQ.data
                    ? usdc(balanceQ.data.usdcBalance)
                    : "Indisponible"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {balanceQ.data
                  ? `Perps : ${usdc(balanceQ.data.perpsUsdc)} · Spot : ${usdc(balanceQ.data.spotUsdc)}`
                  : balanceQ.error instanceof Error
                    ? balanceQ.error.message
                    : "Le solde sera lu depuis Hyperliquid."}
              </p>
              {balanceQ.data && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Marge Perps disponible : {usdc(balanceQ.data.availableMarginUsd)} · Spot disponible :{" "}
                  {usdc(balanceQ.data.spotAvailableUsd)}
                </p>
              )}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{balanceQ.data ? `${balanceQ.data.openPositions} position(s) ouverte(s)` : "—"}</p>
              <p className="mt-1">
                {balanceQ.data
                  ? `Actualisé à ${new Date(balanceQ.data.updatedAt).toLocaleTimeString("fr-CA")}`
                  : "Actualisation automatique toutes les 10 s"}
              </p>
              {balanceQ.data?.walletAddress && (
                <p className="mt-1 font-mono">{shortAddress(balanceQ.data.walletAddress)}</p>
              )}
            </div>
          </div>
          {balanceQ.isFetching && !balanceQ.isLoading && (
            <p className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
              Actualisation…
            </p>
          )}
        </div>
      )}

      {/* - Ce que chaque plateforme coûte, aux mêmes réglages - */}
      {(venuesQ.data?.venues.length ?? 0) > 1 && (
        <div className="surface-glass rounded-xl p-6 md:p-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Le même trade, sur chaque plateforme
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Le coût d&apos;une plateforme on-chain depend de la taille : le gaz est en
            dollars, pas en pourcentage. Une meme position de{" "}
            {usd(venuesQ.data?.venues[0]?.notionalUsd ?? 0)} ne coute donc pas la meme
            fraction des deux cotes.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="text-left py-2">Plateforme</th>
                  <th className="text-right py-2">Aller-retour</th>
                  <th className="text-right py-2">Frais fixe / côté</th>
                  <th className="text-right py-2">Trades/jour sous budget</th>
                  <th className="text-right py-2">Compte</th>
                </tr>
              </thead>
              <tbody>
                {(venuesQ.data?.venues ?? []).map((v) => (
                  <tr key={v.venue} className="border-t border-border/30">
                    <td className="py-2.5 font-medium text-foreground/90">{v.label}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {pct(v.roundTripFraction, 3)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {v.fixedCostUsdPerSide > 0 ? usd(v.fixedCostUsdPerSide) : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {v.maxTradesUnderBudget}
                    </td>
                    <td className="py-2.5 text-right text-[11px] text-muted-foreground">
                      {v.credentialsPresent ? "branché" : "absent"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* — Les deux serrures — */}
      <div className="surface-glass rounded-xl p-6 md:p-8 space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-border/40">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Perpétuels — {arming.venueLabel}
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground/90">
              {config.enabled ? "Activé" : "Arrêté"}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — mode {armed ? "armé (les ordres partent)" : "fantôme (rien ne part)"}
              </span>
            </p>
            <p className="mt-1 text-[11px] tracking-wide text-muted-foreground">
              Aller-retour au coût retenu : {pct(arming.roundTripFraction, 3)} du notionnel,
              calculé sur {usd(arming.referenceNotionalUsd)} de position.
              {arming.walletAddress
                ? ` Compte ${arming.walletAddress}.`
                : " Aucun compte branché — capital de référence utilisé."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => enableMut.mutate(!config.enabled)}
              disabled={enableMut.isPending}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold tracking-wide rounded-md transition-all disabled:opacity-50 ${
                config.enabled
                  ? "border border-border/60 hover:border-border hover:bg-muted/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 btn-sheen shadow-sm"
              }`}
            >
              {enableMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Power className="w-4 h-4" />
              )}
              {config.enabled ? "ARRÊTER" : "ACTIVER"}
            </button>

            {armed ? (
              <button
                onClick={() => disarmMut.mutate()}
                disabled={disarmMut.isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold tracking-wide rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all disabled:opacity-50"
              >
                {disarmMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                DÉSARMER
              </button>
            ) : (
              <button
                onClick={() => armMut.mutate()}
                disabled={armMut.isPending || !arming.ok}
                title={arming.ok ? "Armer" : arming.blockers.join(" · ")}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold tracking-wide rounded-md border border-border/60 hover:border-border hover:bg-muted/30 transition-all disabled:opacity-40"
              >
                {armMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                ARMER
              </button>
            )}
          </div>
        </div>

        {/* — Ce qui empêche d'armer — */}
        {!arming.ok && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Avant de pouvoir armer
            </p>
            <ul className="space-y-1">
              {arming.blockers
                .filter((b) => !b.includes("confirmé"))
                .map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-1" />
                    {b}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* — La journée — */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Trades aujourd'hui" value={`${day.tradesToday} / ${config.maxTradesPerDay}`} />
          <Stat label="Frais du jour" value={usd(day.feesPaidTodayUsd)} />
          <Stat label="PnL réalisé du jour" value={usd(day.realizedPnlTodayUsd)} />
          <Stat
            label="Décisions mesurées"
            value={`${arming.shadowDecisions} / ${arming.minShadowDecisions}`}
          />
        </div>
      </div>

      {/* — Réglages — */}
      <div className="surface-glass rounded-xl p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Plafonds
          </p>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold tracking-wide rounded-md border border-border/60 hover:border-border hover:bg-muted/30 transition-all disabled:opacity-50"
          >
            {saveMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            ENREGISTRER
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {FIELDS.map((field) => (
            <label key={field.key} className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-foreground/80">
                {field.label}
              </span>
              <input
                type="number"
                step={field.step}
                value={draft[field.key] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [field.key]: e.target.value }))
                }
                className="w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm"
              />
              <span className="block text-[10px] text-muted-foreground">{field.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {/* — Essai à blanc — */}
      <div className="surface-glass rounded-xl p-6 md:p-8 space-y-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Essai à blanc
        </p>
        <p className="text-sm text-muted-foreground">
          Le verdict complet sur une occasion hypothétique. Rien n'est écrit, rien n'est
          envoyé — c'est la façon de voir l'effet d'un réglage avant de le garder.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <SimField label="Symbole" value={sim.symbol} onChange={(v) => setSim({ ...sim, symbol: v })} />
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wide text-foreground/80">Sens</span>
            <select
              value={sim.side}
              onChange={(e) => setSim({ ...sim, side: e.target.value })}
              className="w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm"
            >
              <option value="long">long</option>
              <option value="short">short</option>
            </select>
          </label>
          <SimField label="Entrée" value={sim.entryPrice} onChange={(v) => setSim({ ...sim, entryPrice: v })} />
          <SimField label="Stop" value={sim.stopPrice} onChange={(v) => setSim({ ...sim, stopPrice: v })} />
          <SimField label="Bord mesuré" value={sim.measuredGrossEdge} onChange={(v) => setSim({ ...sim, measuredGrossEdge: v })} />
          <SimField label="Échantillon" value={sim.sampleSize} onChange={(v) => setSim({ ...sim, sampleSize: v })} />
        </div>

        <button
          onClick={() => simulateMut.mutate()}
          disabled={simulateMut.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold tracking-wide rounded-md border border-border/60 hover:border-border hover:bg-muted/30 transition-all disabled:opacity-50"
        >
          {simulateMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Gauge className="w-4 h-4" />
          )}
          CALCULER
        </button>

        {verdict && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <p className="text-sm font-semibold">
              {verdict.allowed ? "La politique prendrait ce trade" : "Refusé"}
              <span className="ml-2 font-normal text-muted-foreground">
                — {verdict.execute ? "et il partirait" : "et rien ne partirait"}
              </span>
            </p>
            {verdict.plan && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Taille" value={String(verdict.plan.size)} />
                <Stat label="Notionnel" value={usd(verdict.plan.notionalUsd)} />
                <Stat
                  label="Levier"
                  value={`${verdict.plan.leverageToSet}× réglé · ${verdict.plan.effectiveLeverage.toFixed(2)}× effectif`}
                />
                <Stat label="Risque si stop touché" value={usd(verdict.plan.riskUsd)} />
                <Stat label="Liquidation" value={verdict.plan.liquidationPrice.toFixed(4)} />
                <Stat label="Marge" value={usd(verdict.plan.marginUsd)} />
                <Stat label="Coût aller-retour" value={usd(verdict.plan.estimatedRoundTripUsd)} />
                <Stat label="Seuil de rentabilité" value={pct(verdict.roundTripFraction, 3)} />
              </div>
            )}
            <ul className="space-y-1">
              {verdict.reasons.map((r, i) => (
                <li key={`${i}-${r}`} className="text-[12px] text-muted-foreground">
                  · {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* — Journal — */}
      <div className="surface-glass rounded-xl p-6 md:p-8 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Dernières décisions
        </p>
        {decisionsQ.data && decisionsQ.data.decisions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="text-left pb-2 pr-4">Quand</th>
                  <th className="text-left pb-2 pr-4">Actif</th>
                  <th className="text-left pb-2 pr-4">Sens</th>
                  <th className="text-right pb-2 pr-4">Notionnel</th>
                  <th className="text-right pb-2 pr-4">Levier</th>
                  <th className="text-left pb-2">Issue</th>
                </tr>
              </thead>
              <tbody>
                {decisionsQ.data.decisions.map((d) => (
                  <tr key={d.id} className="border-t border-border/30">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString("fr-CA")}
                    </td>
                    <td className="py-2 pr-4 font-semibold">{d.symbol}</td>
                    <td className="py-2 pr-4">{d.side}</td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {d.notionalUsd ? usd(Number(d.notionalUsd)) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {d.effectiveLeverage ? `${Number(d.effectiveLeverage).toFixed(2)}×` : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {d.executed
                        ? "exécuté"
                        : d.allowed
                          ? `accepté, retenu (${JSON.parse(d.holds ?? "[]").join(", ") || "—"})`
                          : `refusé (${JSON.parse(d.refusals ?? "[]").join(", ") || "—"})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="w-4 h-4" />
            Aucune décision pour l'instant. Elles apparaîtront dès que le worker évaluera
            des occasions, armé ou non.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground/90">{value}</p>
    </div>
  );
}

function SimField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold tracking-wide text-foreground/80">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}
