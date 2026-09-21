import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useToast } from "@/hooks/use-toast";
import {
  Radar, ShieldAlert, Loader2, Save, RotateCcw, Radio, Activity, Power, TrendingUp, TrendingDown,
  RefreshCw, Globe2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types renvoyés par /api/scanner et /api/signals ───────────────────── */

interface ScannerSettings {
  enabled: boolean;
  mode: "shadow" | "armed" | "disabled";
  quote_currency: string;
  min_quote_volume_24h: string;
  max_spread_pct: string;
  alert_score_threshold: number;
  record_score_threshold: number;
  alert_cooldown_minutes: number;
  max_alerts_per_hour: number;
  max_symbols_per_cycle: number;
  scan_interval_minutes: number;
  last_scan_at: string | null;
  updated_at: string;
}

interface Envelope {
  total_amount: string;
  per_trade_amount: string;
  max_concurrent: number;
  daily_loss_cap_pct: string;
  trailing_stop_pct: string;
  hard_stop_pct: string;
}

interface ScannerPerfRow {
  tranche: string;
  horizon_minutes: number;
  n: number;
  rendement_moyen: string | null;
  meilleur_point_moyen: string | null;
  pire_point_moyen: string | null;
  gagnants: number;
}

interface SignalSource {
  id: string;
  label: string;
  kind: string;
  mode: "shadow" | "active" | "disabled";
  confluence_policy: "require_confirmation" | "advisory" | "veto_only";
  max_signal_age_seconds: number;
  webhook_secret_env: string | null;
  secretConfigured: boolean;
  signaux_recus: number;
  dernier_signal: string | null;
}

interface SignalPerfRow {
  source_id: string;
  horizon_minutes: number;
  n: number;
  rendement_dirige_moyen: string | null;
  gagnants: number;
}

interface HyperliquidMarket {
  symbol: string;
  exchangeSymbol: string;
  base: string;
  quoteCurrency: string;
  settlementCurrency: string;
  active: boolean;
  status: string;
  maxLeverage: number | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  quoteVolume24h: number | null;
}

/* ── Petits utilitaires d'affichage ────────────────────────────────────── */

const HORIZON_LABEL: Record<number, string> = { 60: "1 h", 240: "4 h", 1440: "24 h" };

function horizonLabel(minutes: number): string {
  return HORIZON_LABEL[minutes] ?? `${minutes} min`;
}

/** Affiche un pourcentage signé, ou un tiret quand la mesure n'existe pas. */
function pct(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)} %`;
}

function toneClass(value: string | null): string {
  const n = value === null ? Number.NaN : Number(value);
  if (!Number.isFinite(n) || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-green-400" : "text-destructive";
}

function price(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value >= 100 ? value.toLocaleString("fr-CA", { maximumFractionDigits: 2 })
    : value.toLocaleString("fr-CA", { maximumFractionDigits: 6 });
}

function volume(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function jsonOrThrow(res: Response): Promise<any> {
  return res.json().then((payload) => {
    if (!res.ok) throw new Error(payload?.error ?? "Erreur inconnue");
    return payload;
  });
}

/* ── Scanner ───────────────────────────────────────────────────────────── */

function ScannerSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const settingsQ = useQuery<{ settings: ScannerSettings | null; envelope: Envelope | null; measuredOutcomes: number }>({
    queryKey: ["scanner-settings"],
    queryFn: () => fetch(`${BASE}/api/scanner/settings`).then(jsonOrThrow),
  });

  const [alertThreshold, setAlertThreshold] = useState("");
  const [recordThreshold, setRecordThreshold] = useState("");
  const [cooldown, setCooldown] = useState("");
  const [maxPerHour, setMaxPerHour] = useState("");
  const [interval, setIntervalMinutes] = useState("");

  const resetFromServer = (s: ScannerSettings) => {
    setAlertThreshold(String(s.alert_score_threshold));
    setRecordThreshold(String(s.record_score_threshold));
    setCooldown(String(s.alert_cooldown_minutes));
    setMaxPerHour(String(s.max_alerts_per_hour));
    setIntervalMinutes(String(s.scan_interval_minutes));
  };

  useEffect(() => {
    if (settingsQ.data?.settings) resetFromServer(settingsQ.data.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      setError(null);
      return fetch(`${BASE}/api/scanner/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scanner-settings"] });
      toast({ title: "Réglages du scanner enregistrés" });
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  const settings = settingsQ.data?.settings ?? null;
  const mesures = settingsQ.data?.measuredOutcomes ?? 0;

  if (settingsQ.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        Aucune ligne de réglages. La migration 0022 a-t-elle été appliquée ?
      </div>
    );
  }

  const dirty =
    Number(alertThreshold) !== settings.alert_score_threshold ||
    Number(recordThreshold) !== settings.record_score_threshold ||
    Number(cooldown) !== settings.alert_cooldown_minutes ||
    Number(maxPerHour) !== settings.max_alerts_per_hour ||
    Number(interval) !== settings.scan_interval_minutes;

  return (
    <div className="surface-glass rounded-xl p-6 md:p-8 space-y-7">
      {/* Interrupteur */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-border/40">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scanner</p>
          <p className="mt-1 text-lg font-semibold text-foreground/90">
            {settings.enabled ? "Activé" : "Arrêté"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              — mode {settings.mode === "shadow" ? "observation" : settings.mode === "armed" ? "armé" : "désactivé"}
            </span>
          </p>
          <p className="mt-1 text-[11px] tracking-wide text-muted-foreground">
            {settings.last_scan_at
              ? `Dernier balayage ${new Date(settings.last_scan_at).toLocaleString("fr-CA")}`
              : "Aucun balayage effectué pour l'instant."}
          </p>
        </div>
        <button
          onClick={() => saveMut.mutate({ enabled: !settings.enabled })}
          disabled={saveMut.isPending}
          className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold tracking-wide rounded-md transition-all disabled:opacity-50 ${
            settings.enabled
              ? "border border-border/60 hover:border-border hover:bg-muted/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90 btn-sheen shadow-sm"
          }`}
        >
          {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
          {settings.enabled ? "ARRÊTER" : "ACTIVER"}
        </button>
      </div>

      {/* Mode */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">Mode</label>
        <div className="flex flex-wrap gap-2">
          {(["shadow", "armed", "disabled"] as const).map((mode) => {
            const active = settings.mode === mode;
            const label = mode === "shadow" ? "Observation" : mode === "armed" ? "Armé" : "Désactivé";
            return (
              <button
                key={mode}
                disabled={active || saveMut.isPending}
                onClick={() => {
                  // Le mode armé est le seul qui puisse mener à un ordre réel :
                  // il n'est jamais à un seul clic de distance.
                  if (mode === "armed") {
                    const ok = window.confirm(
                      `Armer le scanner autorise le passage d'ordres réels sous l'enveloppe d'opportunité.\n\n` +
                      `${mesures} horizon(s) mesuré(s) jusqu'ici.\n\nConfirmer ?`,
                    );
                    if (!ok) return;
                    saveMut.mutate({ mode, confirm: true });
                  } else {
                    saveMut.mutate({ mode });
                  }
                }}
                className={`px-4 py-2 text-[12px] font-semibold tracking-wide rounded-md border transition-colors ${
                  active
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "border-border/60 hover:border-border hover:bg-muted/30"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 tracking-wide">
          En observation, le scanner détecte, enregistre et alerte, mais ne passe jamais d'ordre. C'est le mode
          qui permet de juger sur des chiffres — {mesures} horizon(s) mesuré(s) pour l'instant.
        </p>
      </div>

      {/* Seuils */}
      <div className="grid sm:grid-cols-2 gap-6">
        <NumberField
          label="Seuil d'alerte (score)"
          value={alertThreshold}
          onChange={setAlertThreshold}
          hint="Score minimal pour recevoir un courriel."
        />
        <NumberField
          label="Seuil d'enregistrement (score)"
          value={recordThreshold}
          onChange={setRecordThreshold}
          hint="Score minimal pour écrire une détection, même sans alerte."
        />
        <NumberField
          label="Anti-répétition (minutes)"
          value={cooldown}
          onChange={setCooldown}
          hint="Délai minimal entre deux alertes sur la même paire."
        />
        <NumberField
          label="Plafond d'alertes par heure"
          value={maxPerHour}
          onChange={setMaxPerHour}
          hint="Au-delà, les détections sont enregistrées mais pas envoyées."
        />
        <NumberField
          label="Intervalle de balayage (minutes)"
          value={interval}
          onChange={setIntervalMinutes}
          hint="Pris en compte au prochain démarrage du worker."
        />
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/40">
        <button
          onClick={() =>
            saveMut.mutate({
              alertScoreThreshold: Number(alertThreshold),
              recordScoreThreshold: Number(recordThreshold),
              alertCooldownMinutes: Number(cooldown),
              maxAlertsPerHour: Number(maxPerHour),
              scanIntervalMinutes: Number(interval),
            })
          }
          disabled={!dirty || saveMut.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold tracking-wide rounded-md bg-primary text-primary-foreground disabled:opacity-50 transition-all hover:bg-primary/90 btn-sheen shadow-sm"
        >
          {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          ENREGISTRER
        </button>
        <button
          onClick={() => resetFromServer(settings)}
          disabled={!dirty}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold tracking-wide rounded-md border border-border/60 disabled:opacity-40 hover:border-border hover:bg-muted/30 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5 opacity-70" />
          ANNULER
        </button>
      </div>
    </div>
  );
}

function HyperliquidMarkets() {
  const marketsQ = useQuery<{ venue: string; source: string; refreshedAt: string; markets: HyperliquidMarket[] }>({
    queryKey: ["hyperliquid-markets"],
    queryFn: () => fetch(`${BASE}/api/scanner/markets`).then(jsonOrThrow),
    refetchInterval: 60_000,
  });
  const markets = marketsQ.data?.markets ?? [];

  return (
    <section className="mt-10 rounded-xl border border-border/60 bg-card/30 overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Flux public</p>
          <h2 className="mt-1 text-lg font-semibold brand-mark tracking-[0.06em] flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-primary" />
            Marchés perpétuels Hyperliquid accessibles
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Contrats actifs retournés par les métadonnées et tickers publics Hyperliquid.
            Aucun ordre ni secret n’est utilisé pour cette liste.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void marketsQ.refetch()}
          disabled={marketsQ.isFetching}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${marketsQ.isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {marketsQ.isLoading && (
        <div className="px-5 py-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Lecture des marchés publics…
        </div>
      )}
      {marketsQ.isError && (
        <div className="px-5 py-6 text-sm text-destructive">
          Les marchés Hyperliquid ne sont pas disponibles pour le moment.
        </div>
      )}
      {!marketsQ.isLoading && !marketsQ.isError && (
        <>
          <div className="px-5 py-3 text-xs text-muted-foreground border-b border-border/40">
            <span className="font-mono text-foreground">{markets.length}</span> contrats actifs
            {marketsQ.data?.refreshedAt && <> · relevé {new Date(marketsQ.data.refreshedAt).toLocaleTimeString("fr-CA")}</>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Marché</th>
                  <th className="px-3 py-3 text-right font-semibold">Dernier</th>
                  <th className="px-3 py-3 text-right font-semibold">Volume 24 h</th>
                  <th className="px-3 py-3 text-right font-semibold">Levier max.</th>
                  <th className="px-5 py-3 text-right font-semibold">État</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((market) => (
                  <tr key={market.exchangeSymbol} className="border-b border-border/30 last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-mono font-semibold">{market.symbol}</span>
                      <span className="block text-[10px] text-muted-foreground font-mono">{market.exchangeSymbol}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{price(market.last)}</td>
                    <td className="px-3 py-3 text-right font-mono">{volume(market.quoteVolume24h)}</td>
                    <td className="px-3 py-3 text-right font-mono">{market.maxLeverage ? `${market.maxLeverage}×` : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${market.active ? "text-emerald-400" : "text-muted-foreground"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${market.active ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                        {market.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function NumberField({
  label, value, onChange, hint,
}: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">{label}</label>
      <input
        type="number"
        className="w-full px-4 py-3 text-sm bg-background/50 border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono transition-colors hover:border-border"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-[11px] text-muted-foreground mt-2 tracking-wide">{hint}</p>
    </div>
  );
}

/**
 * Le tableau qui doit décider de l'armement. Le pire point compte autant que
 * le rendement : une tranche rentable en moyenne mais qui passe par -25 %
 * n'est pas une tranche qu'on arme.
 */
function ScannerPerformance() {
  const q = useQuery<{ parTranche: ScannerPerfRow[]; total: { detections: number; alertees: number; depuis: string | null } | null }>({
    queryKey: ["scanner-performance"],
    queryFn: () => fetch(`${BASE}/api/scanner/performance`).then(jsonOrThrow),
    refetchInterval: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement des mesures…
      </div>
    );
  }

  const rows = q.data?.parTranche ?? [];
  const total = q.data?.total ?? null;

  return (
    <div className="surface-glass rounded-xl p-6 md:p-8 space-y-5">
      {total && (
        <div className="flex flex-wrap gap-6 text-sm pb-4 border-b border-border/40">
          <Stat label="Détections" value={String(total.detections)} />
          <Stat label="Alertées" value={String(total.alertees)} />
          <Stat
            label="Depuis"
            value={total.depuis ? new Date(total.depuis).toLocaleDateString("fr-CA") : "—"}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground tracking-wide">
          Aucune mesure pour l'instant. Les résultats apparaissent une heure après la première détection.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-left">
                <th className="pb-3 pr-4">Tranche</th>
                <th className="pb-3 pr-4">Horizon</th>
                <th className="pb-3 pr-4 text-right">N</th>
                <th className="pb-3 pr-4 text-right">Rendement</th>
                <th className="pb-3 pr-4 text-right">Meilleur point</th>
                <th className="pb-3 pr-4 text-right">Pire point</th>
                <th className="pb-3 text-right">Gagnants</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="py-2.5 pr-4 font-sans font-semibold">{row.tranche}</td>
                  <td className="py-2.5 pr-4">{horizonLabel(row.horizon_minutes)}</td>
                  <td className="py-2.5 pr-4 text-right">{row.n}</td>
                  <td className={`py-2.5 pr-4 text-right ${toneClass(row.rendement_moyen)}`}>{pct(row.rendement_moyen)}</td>
                  <td className="py-2.5 pr-4 text-right text-green-400/80">{pct(row.meilleur_point_moyen)}</td>
                  <td className="py-2.5 pr-4 text-right text-destructive/80">{pct(row.pire_point_moyen)}</td>
                  <td className="py-2.5 text-right">{row.n > 0 ? `${Math.round((row.gagnants / row.n) * 100)} %` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold font-mono text-foreground/90">{value}</p>
    </div>
  );
}

/* ── Sources de signaux ────────────────────────────────────────────────── */

const POLICY_LABEL: Record<SignalSource["confluence_policy"], string> = {
  require_confirmation: "Confirmation requise",
  advisory: "Consultatif",
  veto_only: "Veto seulement",
};

function SignalSources() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const sourcesQ = useQuery<{ sources: SignalSource[] }>({
    queryKey: ["signal-sources"],
    queryFn: () => fetch(`${BASE}/api/signals/sources`).then(jsonOrThrow),
  });

  const perfQ = useQuery<{ parSource: SignalPerfRow[] }>({
    queryKey: ["signal-performance"],
    queryFn: () => fetch(`${BASE}/api/signals/performance`).then(jsonOrThrow),
    refetchInterval: 60_000,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      setError(null);
      return fetch(`${BASE}/api/signals/sources/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signal-sources"] });
      toast({ title: "Source mise à jour" });
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  if (sourcesQ.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement des sources…
      </div>
    );
  }

  const sources = sourcesQ.data?.sources ?? [];
  const perf = perfQ.data?.parSource ?? [];

  if (sources.length === 0) {
    return (
      <div className="surface-glass rounded-xl p-6 md:p-8">
        <p className="text-sm text-muted-foreground tracking-wide">
          Aucune source déclarée. Une source se crée par <span className="font-mono text-foreground/70">POST /api/signals/sources</span>,
          puis reçoit ses signaux sur <span className="font-mono text-foreground/70">/webhooks/signals/&lt;id&gt;</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {sources.map((source) => {
        const rows = perf.filter((r) => r.source_id === source.id);
        return (
          <div key={source.id} className="surface-glass rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-foreground/90">{source.label}</p>
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{source.id}</p>
                <p className="mt-2 text-[11px] tracking-wide text-muted-foreground">
                  {source.signaux_recus} signal(aux) reçu(s)
                  {source.dernier_signal
                    ? ` — dernier le ${new Date(source.dernier_signal).toLocaleString("fr-CA")}`
                    : ""}
                </p>
                {!source.secretConfigured && source.kind === "push" && (
                  <p className="mt-2 text-[11px] text-amber-500 font-medium">
                    Secret absent de l'environnement ({source.webhook_secret_env ?? "non défini"}) — les webhooks
                    de cette source sont refusés.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(["shadow", "active", "disabled"] as const).map((mode) => {
                  const active = source.mode === mode;
                  const label = mode === "shadow" ? "Observation" : mode === "active" ? "Active" : "Désactivée";
                  return (
                    <button
                      key={mode}
                      disabled={active || updateMut.isPending}
                      onClick={() => {
                        if (mode === "active") {
                          const ok = window.confirm(
                            `Activer « ${source.label} » lui donne le droit d'influencer une entrée en position.\n\nConfirmer ?`,
                          );
                          if (!ok) return;
                          updateMut.mutate({ id: source.id, body: { mode, confirm: true } });
                        } else {
                          updateMut.mutate({ id: source.id, body: { mode } });
                        }
                      }}
                      className={`px-3 py-1.5 text-[11px] font-semibold tracking-wide rounded-md border transition-colors ${
                        active
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "border-border/60 hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/40">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Politique</label>
              <select
                value={source.confluence_policy}
                disabled={updateMut.isPending}
                onChange={(e) => updateMut.mutate({ id: source.id, body: { confluencePolicy: e.target.value } })}
                className="px-3 py-2 text-sm font-medium bg-background/80 border border-border/60 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer hover:border-border transition-colors"
              >
                {(Object.keys(POLICY_LABEL) as SignalSource["confluence_policy"][]).map((p) => (
                  <option key={p} value={p}>{POLICY_LABEL[p]}</option>
                ))}
              </select>
              <span className="text-[11px] text-muted-foreground tracking-wide">
                Fraîcheur maximale : {source.max_signal_age_seconds} s
              </span>
            </div>

            {rows.length > 0 && (
              <div className="pt-4 border-t border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  Rendement dirigé — une vente suivie d'une baisse compte comme une réussite
                </p>
                <div className="flex flex-wrap gap-6 font-mono text-sm">
                  {rows.map((row) => (
                    <div key={row.horizon_minutes}>
                      <p className="text-[10px] font-sans font-bold uppercase tracking-widest text-muted-foreground">
                        {horizonLabel(row.horizon_minutes)} · {row.n}
                      </p>
                      <p className={`mt-1 flex items-center gap-1.5 ${toneClass(row.rendement_dirige_moyen)}`}>
                        {Number(row.rendement_dirige_moyen) > 0
                          ? <TrendingUp className="w-3.5 h-3.5" />
                          : <TrendingDown className="w-3.5 h-3.5" />}
                        {pct(row.rendement_dirige_moyen)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function ScannerPage() {
  usePageMeta(
    "Scanner & Signaux — Soliris Market",
    "Détection d'opportunités et sources de signaux externes, avec leurs résultats mesurés.",
  );

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto animate-fadeUp">
      <div className="mb-8">
        <div className="section-rule mb-4"><span>SCANNER</span></div>
        <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <Radar className="w-5 h-5 text-primary" />
          Détection d'opportunités
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Le scanner mesure l'écart d'une paire à son propre comportement habituel, pas sa hausse brute :
          une paire calme qui fait 6 % compte davantage qu'une paire qui bouge de 10 % tous les jours.
        </p>
      </div>

      <ScannerSection />
      <HyperliquidMarkets />

      <div className="mt-12">
        <div className="section-rule mb-4"><span>RÉSULTATS MESURÉS</span></div>
        <h2 className="text-xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <Activity className="w-5 h-5 text-primary" />
          Ce que les détections ont donné
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Chaque détection est réévaluée à 1 h, 4 h et 24 h. Le pire point atteint compte autant que le
          rendement final — c'est lui qui dit si une tranche de score est tenable.
        </p>
      </div>
      <div className="mt-4">
        <ScannerPerformance />
      </div>

      <div className="mt-12">
        <div className="section-rule mb-4"><span>SIGNAUX EXTERNES</span></div>
        <h2 className="text-xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <Radio className="w-5 h-5 text-primary" />
          Sources de signaux
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Un signal externe n'est jamais un ordre : il passe par la confluence avec notre propre analyse,
          puis par les garde-fous habituels. Une source en observation est mesurée sans rien pouvoir déclencher.
        </p>
      </div>
      <div className="mt-4">
        <SignalSources />
      </div>
    </div>
  );
}
