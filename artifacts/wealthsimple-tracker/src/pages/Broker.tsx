import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  ShieldCheck, Loader2, ExternalLink,
  RefreshCw, CheckCircle2, XCircle, LinkIcon, Info, ShieldOff, ShieldAlert, AlertTriangle,
  Radio,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BrokerStatus {
  mode: "paper" | "live";
  hasCredentials: boolean;
  connected: boolean;
  status: "not_setup" | "pending" | "connected" | "error";
  userId?: string;
  lastSyncedAt?: string | null;
  apiOk?: boolean;
  halted: boolean;
  haltedAt?: string | null;
}

interface Account {
  id?: string;
  number?: string;
  name?: string;
  balance?: number;
  currency?: string;
  type?: string;
  brokerage?: { name?: string };
}

function StatusBadge({ status }: { status: BrokerStatus["status"] }) {
  if (status === "connected")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> Connecté
      </span>
    );
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500">
        <AlertTriangle className="w-3.5 h-3.5" /> En attente de connexion
      </span>
    );
  if (status === "not_setup")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <XCircle className="w-3.5 h-3.5" /> Non configuré
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
      <XCircle className="w-3.5 h-3.5" /> Erreur
    </span>
  );
}

export default function BrokerPage() {
  usePageMeta("Courtier — Soliris Market", "Connexion courtier SnapTrade / Wealthsimple.");
  const qc = useQueryClient();
  const [connectUrl, setConnectUrl] = useState<string | null>(null);

  const statusQ = useQuery<BrokerStatus>({
    queryKey: ["broker-status"],
    queryFn: () => fetch(`${BASE}/api/broker/status`).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const accountsQ = useQuery<Account[]>({
    queryKey: ["broker-accounts"],
    queryFn: () => fetch(`${BASE}/api/broker/accounts`).then((r) => r.json()),
    enabled: statusQ.data?.connected ?? false,
  });

  const setupMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/broker/setup`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-status"] }),
  });

  const connectMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/broker/connect-url`).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.redirectURI) {
        window.open(data.redirectURI, "_blank", "noopener,noreferrer");
      }
      setConnectUrl(data.redirectURI);
    },
  });

  const syncMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/broker/sync`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broker-status"] });
      qc.invalidateQueries({ queryKey: ["broker-accounts"] });
    },
  });

  const haltMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/broker/halt`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-status"] }),
  });

  const tradingModeMut = useMutation({
    mutationFn: (mode: "paper" | "live") =>
      fetch(`${BASE}/api/broker/trading-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broker-status"] });
      qc.invalidateQueries({ queryKey: ["trading-mode"] });
    },
  });

  const resumeMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/broker/resume`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-status"] }),
  });

  const status = statusQ.data;
  const isLoading = statusQ.isLoading;

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto animate-fadeUp">
      <div className="mb-8">
        <div className="section-rule mb-4"><span>COURTIER</span></div>
        <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em]">
          Connexion Wealthsimple
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Via SnapTrade, Soliris Market peut se connecter à ton compte Wealthsimple
          pour lire tes positions et, en mode live, soumettre des ordres automatisés.
        </p>
      </div>

      {/* ── Kill-switch ─────────────────────────────────────────────────────── */}
      {/* Affiché uniquement en mode live — inutile en paper puisqu'aucun ordre
          réel ne peut être soumis de toute façon.                              */}
      {status?.mode === "live" && (
        <div
          className={`mb-6 rounded-xl border p-5 ${
            status.halted
              ? "border-destructive/60 bg-destructive/8"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {status.halted ? (
                <ShieldOff className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              )}
              <div>
                <div className={`text-sm font-semibold mb-0.5 ${status.halted ? "text-destructive" : "text-foreground"}`}>
                  {status.halted ? "Trading suspendu (kill-switch actif)" : "Kill-switch trading"}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {status.halted
                    ? `Aucun ordre ne sera soumis à Wealthsimple, quelle que soit la provenance (manuel ou automatisé). Suspendu le ${status.haltedAt ? new Date(status.haltedAt).toLocaleString("fr-CA") : "—"}.`
                    : "Suspend immédiatement tous les ordres live. Persisté en base — actif même après redémarrage du serveur. Réactivation manuelle requise."}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              {status.halted ? (
                <button
                  onClick={() => resumeMut.mutate()}
                  disabled={resumeMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold tracking-[0.1em] uppercase hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  {resumeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Réactiver le trading
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (window.confirm("Confirmer la suspension de TOUS les ordres live ? Aucun ordre ne sera soumis à Wealthsimple jusqu'à réactivation manuelle.")) {
                      haltMut.mutate();
                    }
                  }}
                  disabled={haltMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/50 bg-destructive/8 text-destructive text-xs font-bold tracking-[0.1em] uppercase hover:bg-destructive/15 transition-all disabled:opacity-50"
                >
                  {haltMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                  Suspendre le trading
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode badge + toggle */}
      {status && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
          {/* Indicateur mode */}
          <div className="flex items-center gap-3">
            {status.mode === "live" ? (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: "#c9a040" }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#c9a040" }} />
              </span>
            ) : (
              <span className="inline-flex h-2 w-2 rounded-full shrink-0 bg-muted-foreground/30" />
            )}
            <div>
              <div className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-0.5">
                Mode de trading
              </div>
              <div className="text-sm font-semibold tracking-wide" style={status.mode === "live" ? { color: "#c9a040" } : {}}>
                {status.mode === "live" ? "Live — ordres réels" : "Paper — simulation"}
              </div>
            </div>
          </div>

          {/* Toggle */}
          <button
            disabled={tradingModeMut.isPending}
            onClick={() => {
              const next = status.mode === "paper" ? "live" : "paper";
              if (next === "live") {
                if (!window.confirm("Passer en mode Live ?\n\nLes ordres seront soumis réellement à Wealthsimple. Tu peux repasser en Paper à tout moment depuis cette page.")) return;
              }
              tradingModeMut.mutate(next);
            }}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium tracking-[0.12em] uppercase text-muted-foreground hover:text-foreground transition-all disabled:opacity-40"
          >
            {tradingModeMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : status.mode === "paper" ? (
              <Radio className="w-3.5 h-3.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            {status.mode === "paper" ? "Activer le Live" : "Repasser en Paper"}
          </button>
        </div>
      )}

      {/* Status card */}
      <div className="market-card rounded-xl border bg-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] tracking-[0.18em] text-muted-foreground">
            STATUT DE CONNEXION
          </span>
          {status && <StatusBadge status={status.status} />}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Vérification…
          </div>
        )}

        {status && !isLoading && (
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-36 shrink-0">Clés API SnapTrade</span>
              {status.hasCredentials ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Configurées
                </span>
              ) : (
                <span className="text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Absentes — voir étapes ci-dessous
                </span>
              )}
            </div>
            {status.userId && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">Utilisateur</span>
                <span className="font-mono text-xs">{status.userId}</span>
              </div>
            )}
            {status.lastSyncedAt && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">Dernière synchro</span>
                <span>{new Date(status.lastSyncedAt).toLocaleString("fr-CA")}</span>
              </div>
            )}
            {status.apiOk != null && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">API SnapTrade</span>
                {status.apiOk ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> En ligne
                  </span>
                ) : (
                  <span className="text-destructive flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Hors ligne
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Setup steps */}
      {!status?.hasCredentials && (
        <div className="mb-6 rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium mb-2">Configuration des secrets SnapTrade (clés personnelles)</p>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>
                  Connecte-toi sur{" "}
                  <a
                    href="https://app.snaptrade.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    app.snaptrade.com
                  </a>{" "}
                  → <strong>Account Settings</strong>.
                </li>
                <li>
                  Note tes quatre identifiants :{" "}
                  <strong>Client ID</strong>, <strong>Consumer Key</strong>,{" "}
                  <strong>User ID</strong> et <strong>User Secret</strong>.
                </li>
                <li>
                  Dans Replit → Secrets, configure les quatre variables :{" "}
                  <code className="text-xs bg-muted px-1 rounded">SNAPTRADE_CLIENT_ID</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">SNAPTRADE_CONSUMER_KEY</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">SNAPTRADE_USER_ID</code>{" "}
                  et{" "}
                  <code className="text-xs bg-muted px-1 rounded">SNAPTRADE_USER_SECRET</code>.
                </li>
                <li>Redémarre le serveur API — la connexion s'initialise automatiquement.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ── Wizard de connexion ─────────────────────────────────────────────── */}
      {status?.hasCredentials && status.status !== "connected" && (
        <div className="mb-6 space-y-3">
          <div className="section-rule mb-4"><span>ÉTAPES DE CONNEXION</span></div>

          {/* Étape 1 — Initialiser */}
          <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 transition-all ${
            status.status === "not_setup"
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-card opacity-60"
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                status.status !== "not_setup"
                  ? "bg-emerald-500/20 text-emerald-500"
                  : "bg-primary/20 text-primary"
              }`}>
                {status.status !== "not_setup" ? <CheckCircle2 className="w-4 h-4" /> : "1"}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">Initialiser la connexion SnapTrade</div>
                <div className="text-xs text-muted-foreground mt-0.5">Crée un utilisateur SnapTrade lié à ton app</div>
              </div>
            </div>
            {status.status === "not_setup" && (
              <button
                onClick={() => setupMut.mutate()}
                disabled={setupMut.isPending}
                className="shrink-0 btn-sheen flex items-center gap-2 border border-primary/60 px-4 py-2 text-xs tracking-[0.14em] text-primary uppercase hover:text-primary-foreground hover:bg-primary transition-colors disabled:opacity-50"
              >
                {setupMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
                Initialiser
              </button>
            )}
          </div>

          {/* Étape 2 — Lier Wealthsimple */}
          <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 transition-all ${
            status.status === "pending"
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-card opacity-60"
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 bg-muted text-muted-foreground">
                2
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">Lier ton compte Wealthsimple</div>
                <div className="text-xs text-muted-foreground mt-0.5">Portail OAuth SnapTrade — s'ouvre dans un nouvel onglet</div>
              </div>
            </div>
            {status.status === "pending" && (
              <button
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending}
                className="shrink-0 btn-sheen flex items-center gap-2 border border-primary/60 px-4 py-2 text-xs tracking-[0.14em] text-primary uppercase hover:text-primary-foreground hover:bg-primary transition-colors disabled:opacity-50"
              >
                {connectMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                Lier Wealthsimple
              </button>
            )}
          </div>

          {/* Étape 3 — Synchroniser */}
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 opacity-40">
            <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 bg-muted text-muted-foreground">3</div>
            <div>
              <div className="text-sm font-medium">Synchroniser les comptes</div>
              <div className="text-xs text-muted-foreground mt-0.5">Disponible après la connexion Wealthsimple</div>
            </div>
          </div>
        </div>
      )}

      {/* Boutons post-connexion */}
      {status?.connected && (
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="btn-sheen flex items-center gap-2 border border-border px-5 py-2.5 text-xs tracking-[0.18em] text-foreground uppercase hover:bg-muted"
          >
            {syncMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Rafraîchir comptes
          </button>
          <button
            onClick={() => connectMut.mutate()}
            disabled={connectMut.isPending}
            className="btn-sheen flex items-center gap-2 border border-border px-5 py-2.5 text-xs tracking-[0.18em] text-muted-foreground uppercase hover:bg-muted"
          >
            {connectMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Reconnecter
          </button>
        </div>
      )}

      {/* Accounts */}
      {accountsQ.data && accountsQ.data.length > 0 && (
        <div>
          <div className="section-rule mb-4"><span>COMPTES LIÉS</span></div>
          <div className="space-y-3">
            {accountsQ.data.map((acc, i) => (
              <div key={acc.id ?? i} className="lux-card rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{acc.name ?? acc.number ?? "Compte"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {acc.brokerage?.name} · {acc.type}
                    </div>
                  </div>
                  {acc.balance != null && (
                    <div className="text-right text-sm font-mono shrink-0">
                      {acc.currency}{" "}
                      {typeof acc.balance === "number"
                        ? acc.balance.toLocaleString("fr-CA", { minimumFractionDigits: 2 })
                        : acc.balance}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
