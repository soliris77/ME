import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, ShieldAlert, Loader2, Save, RotateCcw, Bell, MessageSquareWarning, KeyRound, Eye, EyeOff } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface RiskSettings {
  maxOrderValue: number;
  maxPortfolioExposure: number;
  largeOrderFrictionPct: number;
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
    <div className="bg-card border border-card-border rounded-xl p-6 space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Email</label>
          <input
            type="email"
            placeholder="toi@exemple.com"
            className={`w-full px-3 py-2.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring ${
              emailValid ? "border-input" : "border-destructive"
            }`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {!emailValid && <p className="text-xs text-destructive mt-1.5">Adresse email invalide.</p>}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Téléphone (SMS)</label>
          <input
            type="tel"
            placeholder="+15145551234"
            className={`w-full px-3 py-2.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono ${
              phoneValid ? "border-input" : "border-destructive"
            }`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {!phoneValid && <p className="text-xs text-destructive mt-1.5">Format E.164 attendu, ex. +15145551234.</p>}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-400">
        <MessageSquareWarning className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Le SMS est envoyé via Twilio et coûte des frais par message, contrairement à l'email. Il n'est jamais activé par défaut — choisis-le explicitement par type d'événement ci-dessous.</span>
      </div>

      <div className="space-y-3">
        {NOTIFICATION_EVENTS.map((evt) => (
          <div key={evt.key} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{evt.label}</p>
              <p className="text-xs text-muted-foreground">{evt.description}</p>
            </div>
            <select
              value={channels[evt.key] ?? "email"}
              onChange={(e) => setChannels((c) => ({ ...c, [evt.key]: e.target.value as NotificationChannel }))}
              className="shrink-0 px-2.5 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
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
        <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => saveMut.mutate()}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
        <button
          onClick={() => prefsQ.data && resetFromServer(prefsQ.data)}
          disabled={!dirty}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md border border-input disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Annuler
        </button>
        {prefsQ.data && (
          <span className="text-xs text-muted-foreground ml-auto">
            Dernière modification : {new Date(prefsQ.data.updatedAt).toLocaleString("fr-CA")}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  usePageMeta("Paramètres — Soliris Market", "Seuils de risque et friction sur les ordres importants.");
  const qc = useQueryClient();
  const { toast } = useToast();
  const settingsQ = useRiskSettings();

  const [maxOrderValue, setMaxOrderValue] = useState("");
  const [maxPortfolioExposure, setMaxPortfolioExposure] = useState("");
  const [frictionPct, setFrictionPct] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetFromServer = (data: RiskSettings) => {
    setMaxOrderValue(String(data.maxOrderValue));
    setMaxPortfolioExposure(String(data.maxPortfolioExposure));
    setFrictionPct(String(Math.round(data.largeOrderFrictionPct * 100)));
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
      Math.round(Number(frictionPct)) !== Math.round(settingsQ.data.largeOrderFrictionPct * 100));

  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto animate-fadeUp">
      <div className="mb-8">
        <div className="section-rule mb-4"><span>PARAMÈTRES</span></div>
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
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-6">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Valeur maximale par ordre
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                value={maxOrderValue}
                onChange={(e) => setMaxOrderValue(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Tout ordre dont la valeur dépasse ce montant est refusé automatiquement par les garde-fous.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Exposition maximale du portefeuille
            </label>
            <input
              type="number"
              min="1"
              step="1"
              className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              value={maxPortfolioExposure}
              onChange={(e) => setMaxPortfolioExposure(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Limite l'exposition totale (par devise) après un achat. Ne s'applique pas aux ventes.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Seuil de confirmation renforcée
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                className="w-full px-3 py-2.5 pr-9 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                value={frictionPct}
                onChange={(e) => setFrictionPct(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              % de la valeur maximale par ordre au-delà duquel un délai de confirmation de 3 secondes s'applique.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => saveMut.mutate()}
              disabled={!dirty || saveMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
            <button
              onClick={() => settingsQ.data && resetFromServer(settingsQ.data)}
              disabled={!dirty}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md border border-input disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Annuler
            </button>
            {settingsQ.data && (
              <span className="text-xs text-muted-foreground ml-auto">
                Dernière modification : {new Date(settingsQ.data.updatedAt).toLocaleString("fr-CA")}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-10">
        <div className="section-rule mb-4"><span>NOTIFICATIONS</span></div>
        <h2 className="text-xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <Bell className="w-5 h-5 text-primary" />
          Canaux de notification
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Choisis où recevoir chaque type d'événement critique — par email, par SMS, les deux, ou aucun.
        </p>
      </div>
      <div className="mt-4">
        <NotificationsSection />
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
