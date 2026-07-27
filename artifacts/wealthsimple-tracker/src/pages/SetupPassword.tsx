/**
 * SetupPassword — Page de premier lancement
 * ─────────────────────────────────────────────────────────────────────────
 * Affichée uniquement quand aucun mot de passe n'est encore configuré
 * (ni en base, ni via AUTH_PASSWORD). Permet de définir le mot de passe
 * initial qui sera stocké en base de données et survivra aux remixes / forks.
 *
 * Une fois le mot de passe défini, la session s'ouvre directement
 * et l'utilisateur est redirigé vers le tableau de bord.
 */
import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { KeyRound, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ACCENT = "#D4A72C";
const SURFACE = "#131722";
const BASE_BG = "#0B0E14";
const BORDER_C = "#232838";
const MUTED = "#8B92A5";

export default function SetupPassword() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/setup`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Erreur de configuration.");
      // Session ouverte côté serveur — on recharge proprement
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4"
      style={{ background: "#07080a", color: "#f2ead6" }}
    >
      <div
        className="w-full max-w-[400px] p-8 rounded-xl"
        style={{ background: SURFACE, border: `1px solid ${BORDER_C}`, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ background: "rgba(212,167,44,0.1)", border: `1px solid rgba(212,167,44,0.3)` }}
          >
            <KeyRound className="w-5 h-5" style={{ color: ACCENT }} />
          </div>
          <h1 className="brand-mark text-[15px] tracking-[0.24em]" style={{ color: ACCENT }}>
            SOLIRIS MARKET
          </h1>
          <p className="text-[13px] font-semibold mt-2" style={{ color: "#f2ead6" }}>
            Premier lancement
          </p>
          <p className="text-[12px] mt-1" style={{ color: MUTED }}>
            Définissez votre mot de passe d'accès. Il sera stocké dans la base de données
            et restera actif même si vous transférez ce projet.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              className="w-full rounded-lg px-4 py-3 text-[14px] focus:outline-none pr-10"
              style={{ background: BASE_BG, border: `1px solid ${BORDER_C}`, color: "#E8E9ED" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
              onBlur={(e) => (e.currentTarget.style.borderColor = BORDER_C)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirmer le mot de passe"
            className="w-full rounded-lg px-4 py-3 text-[14px] focus:outline-none"
            style={{ background: BASE_BG, border: `1px solid ${BORDER_C}`, color: "#E8E9ED" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = BORDER_C)}
          />

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px]"
              style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", color: "#DC2626" }}
            >
              <span className="mt-0.5">⚠</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-[13px] font-bold tracking-[0.06em] text-black transition-opacity disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Configuration…</>
              : <><ShieldCheck className="w-3.5 h-3.5" /> Définir le mot de passe</>}
          </button>
        </form>

        <p className="text-[10px] text-center mt-4" style={{ color: MUTED }}>
          Ce mot de passe peut être changé ultérieurement depuis les paramètres.
        </p>
      </div>
    </div>
  );
}
