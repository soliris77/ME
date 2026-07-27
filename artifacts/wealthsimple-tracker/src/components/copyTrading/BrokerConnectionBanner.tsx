/**
 * BrokerConnectionBanner — affichée si le compte MetaTrader n'est pas encore connecté.
 * Contient aussi le formulaire de connexion inline.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LinkIcon, Loader2, AlertCircle, Unlink, ChevronDown, ChevronUp, ShieldCheck, Eye } from "lucide-react";
import type { MtStatus } from "@/pages/CopyTrading";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  status: MtStatus | null;
}

export default function BrokerConnectionBanner({ status }: Props) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ login: "", investorPassword: "", server: "", platform: "mt4" as "mt4" | "mt5" });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const connectMut = useMutation({
    mutationFn: (data: typeof form) =>
      fetch(`${BASE}/api/integrations/metatrader/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Erreur inconnue");
        return json;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mt-status"] });
      qc.invalidateQueries({ queryKey: ["followed-traders"] });
      setShowForm(false);
      setFormError(null);
    },
    onError: (err) => setFormError(String(err instanceof Error ? err.message : err)),
  });

  const disconnectMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/integrations/metatrader/disconnect`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mt-status"] });
      qc.invalidateQueries({ queryKey: ["followed-traders"] });
    },
  });

  // Vérifications de configuration
  const missingToken = status && !status.hasApiToken;
  const missingKey = status && !status.hasEncryptionKey;

  if (status?.connected) {
    return (
      <div className="mb-6 flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Compte MetaTrader connecté ({status.brokerServer})</span>
        </div>
        <button
          onClick={() => disconnectMut.mutate()}
          disabled={disconnectMut.isPending}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          {disconnectMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Unlink className="w-3.5 h-3.5" />
          )}
          Déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 bg-card border border-card-border rounded-xl overflow-hidden">
      {/* En-tête */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <LinkIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Connecte ton compte MetaTrader</p>
            <p className="text-xs text-muted-foreground">
              Requis pour découvrir et copier des traders via MetaApi / CopyFactory.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <LinkIcon className="w-3.5 h-3.5" />
          Connecter
          {showForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Avertissements de configuration */}
      {(missingToken || missingKey) && (
        <div className="px-5 pb-4">
          {missingToken && (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2.5 mb-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                <strong>METAAPI_TOKEN</strong> n'est pas configuré. Crée un compte sur{" "}
                <a href="https://app.metaapi.cloud" target="_blank" rel="noopener noreferrer" className="underline">
                  metaapi.cloud
                </a>{" "}
                et ajoute le token dans les secrets Replit.
              </span>
            </div>
          )}
          {missingKey && (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                <strong>ENCRYPTION_KEY</strong> n'est pas configuré. Génère-le avec :{" "}
                <code className="bg-black/30 px-1 py-0.5 rounded text-[10px]">
                  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
                </code>{" "}
                et ajoute-le dans les secrets Replit.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Formulaire de connexion */}
      {showForm && (
        <div className="px-5 pb-5 border-t border-card-border pt-4">
          {/* Avertissement investisseur */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-sidebar-accent rounded-lg px-3 py-2.5 mb-4">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
            <span>
              <strong>Mot de passe investisseur uniquement.</strong> Ne saisis jamais ton mot de passe maître ici.
              Le mot de passe investisseur donne uniquement un accès en lecture à ton compte MT — il ne permet
              aucun retrait ni aucun ordre.
            </span>
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 mb-4">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Login MT */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Login (numéro de compte)
              </label>
              <input
                type="text"
                value={form.login}
                onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                placeholder="ex. 12345678"
                className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Serveur broker */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Serveur du broker
              </label>
              <input
                type="text"
                value={form.server}
                onChange={(e) => setForm((f) => ({ ...f, server: e.target.value }))}
                placeholder="ex. Exness-Real3"
                className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Mot de passe investisseur */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Mot de passe investisseur
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.investorPassword}
                  onChange={(e) => setForm((f) => ({ ...f, investorPassword: e.target.value }))}
                  placeholder="Mot de passe investisseur"
                  className="w-full px-3 py-2 pr-9 bg-input border border-input-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Plateforme */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Plateforme
              </label>
              <select
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as "mt4" | "mt5" }))}
                className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="mt4">MetaTrader 4</option>
                <option value="mt5">MetaTrader 5</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => connectMut.mutate(form)}
            disabled={connectMut.isPending || !form.login || !form.investorPassword || !form.server}
            className="mt-4 flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {connectMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Connecter le compte
          </button>
        </div>
      )}
    </div>
  );
}
