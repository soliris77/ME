import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, ShieldAlert, Loader2, Save, RotateCcw, Bell, MessageSquareWarning, KeyRound, Eye, EyeOff, Crown, RefreshCw, Activity, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import PersonalizationCenter from "@/components/PersonalizationCenter";
import {
  subscriptionLabel,
  useGrantFounder,
  useRefreshSubscription,
  useRevokeFounder,
  useSubscription,
} from "@/hooks/use-subscription";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface RiskSettings {
  maxOrderValue: number;
  maxPortfolioExposure: number;
  largeOrderFrictionPct: number;
  maxDailyLossAmount: number | null;
  updatedAt: string;
}

function useRiskSettings() {
  return useQuery<RiskSettings>({
    queryKey: ["risk-settings"],
    queryFn: () => fetch(`${BASE}/api/settings`).then((r) => r.json()),
  });
}

type NotificationChannel = "email" | "sms" | "both" | "none";

interface NotificationPreferences {
  email: string | null;
  phone: string | null;
  killSwitchChannel: NotificationChannel;
  largeOrderChannel: NotificationChannel;
  thresholdChangeChannel: NotificationChannel;
  priceAlertChannel: NotificationChannel;
  patternAlertChannel: NotificationChannel;
  updatedAt: string;
}

const NOTIFICATION_EVENTS: { key: keyof Omit<NotificationPreferences, "email" | "phone" | "updatedAt">; label: string; description: string }[] = [
  { key: "killSwitchChannel", label: "Kill-switch activé", description: "Trading suspendu manuellement ou automatiquement." },
  { key: "largeOrderChannel", label: "Gros ordre exécuté", description: "Un ordre dépassant le seuil de confirmation renforcée a été exécuté." },
  { key: "thresholdChangeChannel", label: "Changement de seuils", description: "Les paramètres de risque ont été modifiés." },
  { key: "priceAlertChannel", label: "Alerte de prix", description: "Une alerte de prix que tu as créée s'est déclenchée." },
  { key: "patternAlertChannel", label: "Alerte de pattern", description: "Une alerte intelligente (pattern chandelier) s'est déclenchée." },
];

function useNotificationPreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: ["notification-preferences"],
    queryFn: () => fetch(`${BASE}/api/notification-preferences`).then((r) => r.json()),
  });
}

const CHANNEL_OPTIONS: { value: NotificationChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "both", label: "Les deux" },
  { value: "none", label: "Aucun" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{1,14}$/;

function NotificationsSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const prefsQ = useNotificationPreferences();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channels, setChannels] = useState<Record<string, NotificationChannel>>({});
  const [error, setError] = useState<string | null>(null);

  const resetFromServer = (data: NotificationPreferences) => {
    setEmail(data.email ?? "");
    setPhone(data.phone ?? "");
    setChannels({
      killSwitchChannel: data.killSwitchChannel,
      largeOrderChannel: data.largeOrderChannel,
      thresholdChangeChannel: data.thresholdChangeChannel,
      priceAlertChannel: data.priceAlertChannel,
      patternAlertChannel: data.patternAlertChannel,
    });
  };

  useEffect(() => {
    if (prefsQ.data) resetFromServer(prefsQ.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsQ.data]);

  const emailValid = email === "" || EMAIL_RE.test(email);
  const phoneValid = phone === "" || E164_RE.test(phone);
  const hasSmsChannel = Object.values(channels).some((c) => c === "sms" || c === "both");

  const saveMut = useMutation({
    mutationFn: async () => {
      setError(null);
      const res = await fetch(`${BASE}/api/notification-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || null, phone: phone || null, ...channels }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Erreur inconnue");
      return payload as NotificationPreferences;
    },
    onSuccess: (data) => {
      resetFromServer(data);
      qc.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast({ title: "Préférences de notification enregistrées" });
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  const dirty =
    !!prefsQ.data &&
    (email !== (prefsQ.data.email ?? "") ||
      phone !== (prefsQ.data.phone ?? "") ||
      NOTIFICATION_EVENTS.some((e) => channels[e.key] !== prefsQ.data![e.key]));

  const canSubmit = dirty && emailValid && phoneValid && !saveMut.isPending && (!hasSmsChannel || phone !== "");

  if (prefsQ.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="surface-glass rounded-xl p-6 md:p-8 space-y-7">
      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">Email</label>
          <input
            type="email"
            placeholder="toi@exemple.com"
            className={`w-full px-4 py-3 text-sm bg-background/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors ${
              emailValid ? "border-border/60 hover:border-border" : "border-destructive"
            }`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {!emailValid && <p className="text-[11px] text-destructive mt-2">Adresse email invalide.</p>}
        </div>
        <div>
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">Téléphone (SMS)</label>
          <input
            type="tel"
            placeholder="+15145551234"
            className={`w-full px-4 py-3 text-sm bg-background/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono transition-colors ${
              phoneValid ? "border-border/60 hover:border-border" : "border-destructive"
            }`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {!phoneValid && <p className="text-[11px] text-destructive mt-2">Format E.164 attendu, ex. +15145551234.</p>}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-amber-500/5 border border-amber-500/20 text-amber-500">
        <MessageSquareWarning className="w-4 h-4 shrink-0 mt-0.5" />
        <span className="leading-relaxed">Le SMS est envoyé via Twilio et coûte des frais par message, contrairement à l'email. Il n'est jamais activé par défaut — choisis-le explicitement par type d'événement ci-dessous.</span>
      </div>

      <div className="space-y-4 pt-2">
        {NOTIFICATION_EVENTS.map((evt) => (
          <div key={evt.key} className="flex items-center justify-between gap-6 py-3 border-b border-border/40 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground/90">{evt.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 tracking-wide">{evt.description}</p>
            </div>
            <select
              value={channels[evt.key] ?? "email"}
              onChange={(e) => setChannels((c) => ({ ...c, [evt.key]: e.target.value as NotificationChannel }))}
              className="shrink-0 px-3 py-2 text-sm font-medium bg-background/80 border border-border/60 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer hover:border-border transition-colors"
            >
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={(opt.value === "sms" || opt.value === "both") && !phone}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/40">
        <button
          onClick={() => saveMut.mutate()}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold tracking-wide rounded-md bg-primary text-primary-foreground disabled:opacity-50 transition-all hover:bg-primary/90 btn-sheen shadow-sm"
        >
          {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          ENREGISTRER
        </button>
        <button
          onClick={() => prefsQ.data && resetFromServer(prefsQ.data)}
          disabled={!dirty}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold tracking-wide rounded-md border border-border/60 disabled:opacity-40 hover:border-border hover:bg-muted/30 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5 opacity-70" />
          ANNULER
        </button>
        {prefsQ.data && (
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-auto font-mono opacity-70">
            Dernière modif. {new Date(prefsQ.data.updatedAt).toLocaleString("fr-CA")}
          </span>
        )}
      </div>
    </div>
  );
}

function SubscriptionSection() {
  const { subscription, isLoading, isError } = useSubscription();
  const refresh = useRefreshSubscription();
  const grantFounder = useGrantFounder();
  const revokeFounder = useRevokeFounder();
  const [founderCode, setFounderCode] = useState("");

  const error =
    refresh.error?.message ??
    grantFounder.error?.message ??
    revokeFounder.error?.message ??
    (isError ? "L’état d’abonnement est indisponible." : null);

  return (
    <div className="surface-glass border border-border/40 rounded-xl p-6 md:p-8 space-y-5">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement de l’abonnement…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">État actuel</p>
              <p className="mt-1 text-lg font-semibold text-foreground/90">
                {subscription.founder ? "Accès fondateur" : subscriptionLabel(subscription.status)}
              </p>
              {subscription.inGrace && (
                <p className="mt-1 text-[11px] text-amber-500 font-medium">Paiement en retard — l’accès reste temporairement ouvert.</p>
              )}
              {subscription.currentPeriodEnd && (
                <p className="mt-1 text-[11px] tracking-wide text-muted-foreground">
                  Période actuelle jusqu’au {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-CA")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-semibold tracking-wide rounded-md border border-border/60 hover:bg-muted/30 hover:border-border transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
              ACTUALISER
            </button>
          </div>

          {subscription.founder ? (
            <button
              type="button"
              onClick={() => revokeFounder.mutate()}
              disabled={revokeFounder.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-md border border-input disabled:opacity-50"
            >
              {revokeFounder.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Refermer l’accès fondateur
            </button>
          ) : subscription.founderAvailable ? (
            <form
              className="space-y-4 border-t border-border/40 pt-5 mt-2"
              onSubmit={(event) => {
                event.preventDefault();
                grantFounder.mutate(founderCode, { onSuccess: () => setFounderCode("") });
              }}
            >
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                Clé fondateur
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="password"
                  value={founderCode}
                  onChange={(event) => setFounderCode(event.target.value)}
                  autoComplete="off"
                  className="flex-1 px-4 py-3 text-sm bg-background/50 border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors hover:border-border"
                />
                <button
                  type="submit"
                  disabled={!founderCode.trim() || grantFounder.isPending}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold tracking-wide rounded-lg bg-primary text-primary-foreground disabled:opacity-50 btn-sheen shadow-sm"
                >
                  {grantFounder.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  OUVRIR L'ACCÈS
                </button>
              </div>
            </form>
          ) : null}

          {error && (
            <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive mt-4">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IntegrationsHealthSection() {
  const q = useQuery<{ generatedAt: string; overall: string; entries: Record<string, { status: string; configured: boolean; summary: string; metadata?: any }> }>({
    queryKey: ["integrations-health"],
    queryFn: () => fetch(`${BASE}/api/integrations/health`).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement de l'état des intégrations…
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        Impossible de charger l'état des intégrations.
      </div>
    );
  }

  const { overall, entries, generatedAt } = q.data;
  const labels: Record<string, string> = {
    snaptrade: "SnapTrade (Courtier)",
    yahoo: "Yahoo Finance (Données)",
    twilio: "Twilio (SMS)",
    resend: "Resend (Email)",
    whop: "Whop (Abonnements)",
    autoTrader: "Auto-Trader (Moteur)",
  };

  return (
    <div className="surface-glass border border-border/40 rounded-xl p-6 md:p-8 space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">État global</span>
          {overall === "ok" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-green-500/10 border border-green-500/20 text-green-400 font-bold text-[9px] tracking-widest uppercase">
              <CheckCircle2 className="w-3.5 h-3.5" /> Opérationnel
            </span>
          ) : overall === "degraded" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-[9px] tracking-widest uppercase">
              <AlertCircle className="w-3.5 h-3.5" /> Dégradé
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-destructive/10 border border-destructive/20 text-destructive font-bold text-[9px] tracking-widest uppercase">
              <XCircle className="w-3.5 h-3.5" /> Erreur
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono tracking-widest uppercase">
          <Clock className="w-3 h-3 opacity-70" />
          MAJ {new Date(generatedAt).toLocaleTimeString("fr-CA")}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(entries).map(([key, data]) => (
          <div key={key} className="p-5 rounded-xl bg-background/30 border border-border/40 flex flex-col gap-3 transition-colors hover:border-border/80 hover:bg-background/50">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-bold text-[13px] tracking-wide">{labels[key] || key}</h4>
              {data.status === "ok" ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              ) : data.status === "degraded" ? (
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              ) : data.status === "not_configured" ? (
                <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive shrink-0" />
              )}
            </div>

            <p className="text-[11px] text-muted-foreground/80 leading-relaxed tracking-wide">
              {data.summary}
            </p>

            {data.status === "not_configured" && (
              <span className="inline-block mt-auto pt-3 text-[9px] text-muted-foreground/50 uppercase tracking-[0.2em] font-bold">
                Non configuré
              </span>
            )}
            {data.configured && data.status !== "not_configured" && (
              <span className="inline-block mt-auto pt-3 text-[9px] text-primary/70 uppercase tracking-[0.2em] font-bold">
                Configuré
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-[11px] bg-muted/20 border border-border/40 text-muted-foreground tracking-wide mt-2">
        <Activity className="w-4 h-4 shrink-0 opacity-70" />
        <span className="leading-relaxed">
          L'état "Configuré" ou "OK" garantit la présence des identifiants et le succès des requêtes de base, mais n'implique pas toujours un test réseau complet (ex: émission réelle d'un SMS ou exécution d'un ordre).
        </span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  usePageMeta("Paramètres — Soliris Market", "Personnalisation de l’espace Soliris et seuils de risque.");
  const qc = useQueryClient();
  const { toast } = useToast();
  const settingsQ = useRiskSettings();

  const [maxOrderValue, setMaxOrderValue] = useState("");
  const [maxPortfolioExposure, setMaxPortfolioExposure] = useState("");
  const [frictionPct, setFrictionPct] = useState("");
  const [maxDailyLoss, setMaxDailyLoss] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetFromServer = (data: RiskSettings) => {
    setMaxOrderValue(String(data.maxOrderValue));
    setMaxPortfolioExposure(String(data.maxPortfolioExposure));
    setFrictionPct(String(Math.round(data.largeOrderFrictionPct * 100)));
    setMaxDailyLoss(data.maxDailyLossAmount != null ? String(data.maxDailyLossAmount) : "");
  };

  useEffect(() => {
    if (settingsQ.data) resetFromServer(settingsQ.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      setError(null);
      const body = {
        maxOrderValue: parseFloat(maxOrderValue),
        maxPortfolioExposure: parseFloat(maxPortfolioExposure),
        largeOrderFrictionPct: parseFloat(frictionPct) / 100,
        maxDailyLossAmount: maxDailyLoss.trim() === "" ? null : parseFloat(maxDailyLoss),
      };
      const res = await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Erreur inconnue");
      return payload as RiskSettings;
    },
    onSuccess: (data) => {
      resetFromServer(data);
      qc.invalidateQueries({ queryKey: ["risk-settings"] });
      qc.invalidateQueries({ queryKey: ["broker-status"] });
      qc.invalidateQueries({ queryKey: ["audit-log"] });
      toast({ title: "Paramètres enregistrés" });
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  const dirty =
    settingsQ.data &&
    (Number(maxOrderValue) !== settingsQ.data.maxOrderValue ||
      Number(maxPortfolioExposure) !== settingsQ.data.maxPortfolioExposure ||
      Math.round(Number(frictionPct)) !== Math.round(settingsQ.data.largeOrderFrictionPct * 100) ||
      (maxDailyLoss.trim() === "" ? null : Number(maxDailyLoss)) !== settingsQ.data.maxDailyLossAmount);

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto animate-fadeUp">
      <PersonalizationCenter />

      <div className="mb-8">
        <div className="section-rule mb-4"><span>RISQUE &amp; EXÉCUTION</span></div>
        <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <SettingsIcon className="w-5 h-5 text-primary" />
          Seuils de risque
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Ces valeurs contrôlent les garde-fous appliqués à chaque ordre (paper et live) ainsi que le
          délai de confirmation renforcée. Toute modification est journalisée dans le journal d'audit.
        </p>
      </div>

      {settingsQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="surface-glass rounded-xl p-6 md:p-8 space-y-7">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
              Valeur maximale par ordre
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                className="w-full px-4 py-3 text-sm bg-background/50 border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono transition-colors hover:border-border"
                value={maxOrderValue}
                onChange={(e) => setMaxOrderValue(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 tracking-wide">
              Tout ordre dont la valeur dépasse ce montant est refusé automatiquement par les garde-fous.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
              Exposition maximale du portefeuille
            </label>
            <input
              type="number"
              min="1"
              step="1"
              className="w-full px-4 py-3 text-sm bg-background/50 border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono transition-colors hover:border-border"
              value={maxPortfolioExposure}
              onChange={(e) => setMaxPortfolioExposure(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-2 tracking-wide">
              Limite l'exposition totale (par devise) après un achat. Ne s'applique pas aux ventes.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
              Seuil de confirmation renforcée
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                className="w-full px-4 py-3 pr-10 text-sm bg-background/50 border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono transition-colors hover:border-border"
                value={frictionPct}
                onChange={(e) => setFrictionPct(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 tracking-wide">
              % de la valeur maximale par ordre au-delà duquel un délai de confirmation de 3 secondes s'applique.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
              Perte journalière max ($)
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Vide = désactivé"
                className="w-full px-4 py-3 pr-10 text-sm bg-background/50 border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono transition-colors hover:border-border"
                value={maxDailyLoss}
                onChange={(e) => setMaxDailyLoss(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-muted-foreground">$</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 tracking-wide">
              Coupe-circuit : si la perte réalisée du jour dépasse ce montant, le trading automatique est
              suspendu (kill-switch) jusqu'à réactivation manuelle. Laisse vide pour désactiver.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/40">
            <button
              onClick={() => saveMut.mutate()}
              disabled={!dirty || saveMut.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold tracking-wide rounded-md bg-primary text-primary-foreground disabled:opacity-50 transition-all hover:bg-primary/90 btn-sheen shadow-sm"
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              ENREGISTRER
            </button>
            <button
              onClick={() => settingsQ.data && resetFromServer(settingsQ.data)}
              disabled={!dirty}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold tracking-wide rounded-md border border-border/60 disabled:opacity-40 hover:border-border hover:bg-muted/30 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5 opacity-70" />
              ANNULER
            </button>
            {settingsQ.data && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-auto font-mono opacity-70">
                Dernière modif. {new Date(settingsQ.data.updatedAt).toLocaleString("fr-CA")}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-14">
        <div className="section-rule mb-5"><span>NOTIFICATIONS</span></div>
        <h2 className="text-xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-3">
          <Bell className="w-5 h-5 text-primary" />
          Canaux de notification
        </h2>
        <p className="mt-2 text-[13px] tracking-wide text-muted-foreground max-w-xl">
          Choisis où recevoir chaque type d'événement critique — par email, par SMS, les deux, ou aucun.
        </p>
      </div>
      <div className="mt-4">
        <NotificationsSection />
      </div>

      <div className="mt-10">
        <div className="section-rule mb-4"><span>ABONNEMENT</span></div>
        <h2 className="text-xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <Crown className="w-5 h-5 text-primary" />
          Soliris Premium
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Consulte l’état de ton accès, synchronise Whop ou gère l’accès fondateur de cette instance.
        </p>
      </div>
      <div className="mt-4">
        <SubscriptionSection />
      </div>

      <div className="mt-10">
        <div className="section-rule mb-4"><span>INTÉGRATIONS & SANTÉ</span></div>
        <h2 className="text-xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <Activity className="w-5 h-5 text-primary" />
          État du système
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Surveille la connectivité et la configuration des différents services externes.
        </p>
      </div>
      <div className="mt-4">
        <IntegrationsHealthSection />
      </div>

      <div className="mt-10">
        <div className="section-rule mb-4"><span>SÉCURITÉ</span></div>
        <h2 className="text-xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <KeyRound className="w-5 h-5 text-primary" />
          Changer le mot de passe
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Mets à jour le mot de passe d'accès à l'application.
        </p>
      </div>
      <div className="mt-4">
        <ChangePasswordSection />
      </div>
    </div>
  );
}

function ChangePasswordSection() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const changeMut = useMutation({
    mutationFn: async () => {
      setError(null);
      if (newPassword !== confirmPassword) {
        throw new Error("Les nouveaux mots de passe ne correspondent pas.");
      }
      if (newPassword.length < 6) {
        throw new Error("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      }
      const res = await fetch(`${BASE}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Erreur inconnue");
      return payload;
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Mot de passe mis à jour" });
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  });

  const dirty = currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;

  return (
    <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Mot de passe actuel
        </label>
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            className="w-full px-3 py-2.5 pr-10 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Nouveau mot de passe
        </label>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            className="w-full px-3 py-2.5 pr-10 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Confirmer le nouveau mot de passe
        </label>
        <input
          type="password"
          className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => changeMut.mutate()}
          disabled={!dirty || changeMut.isPending}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {changeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Mettre à jour
        </button>
        <button
          onClick={() => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setError(null); }}
          disabled={!dirty}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md border border-input disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Effacer
        </button>
      </div>
    </div>
  );
}
