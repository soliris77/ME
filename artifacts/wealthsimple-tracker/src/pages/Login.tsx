/**
 * Login — porte d'entrée unique du système
 * ─────────────────────────────────────────────────────────────────────────
 * Mono-utilisateur, un seul mot de passe. Redirige vers la page demandée
 * (ou /dashboard) dès qu'une session valide est établie.
 */
import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePageMeta } from "@/hooks/use-page-meta";

const ACCENT = "#D4A72C";
const SURFACE = "#131722";
const BASE_BG = "#0B0E14";
const BORDER_C = "#232838";
const MUTED = "#8B92A5";

export default function Login() {
  usePageMeta("Connexion — Soliris Market", "Accès protégé.");
  const [, navigate] = useLocation();
  const { login, isLoggingIn, loginError } = useAuth();
  const [password, setPassword] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    try {
      await login(password);
      const params = new URLSearchParams(window.location.search);
      navigate(params.get("next") || "/dashboard");
    } catch {
      // loginError vient déjà du hook — rien de plus à faire ici
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4"
      style={{ background: "#07080a", color: "#f2ead6" }}
    >
      <div
        className="w-full max-w-[380px] p-8 rounded-xl"
        style={{ background: SURFACE, border: `1px solid ${BORDER_C}`, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src="/soliris-icon.svg"
            alt="Soliris Market"
            className="w-16 h-16 object-contain mb-4 drop-shadow-[0_0_12px_rgba(212,167,44,0.3)]"
          />
          <h1 className="brand-mark text-[15px] tracking-[0.24em]" style={{ color: ACCENT }}>
            SOLIRIS MARKET
          </h1>
          <p className="text-[12px] mt-2" style={{ color: MUTED }}>
            Accès protégé — entrez le mot de passe pour continuer.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            className="w-full rounded-lg px-4 py-3 text-[14px] focus:outline-none"
            style={{ background: BASE_BG, border: `1px solid ${BORDER_C}`, color: "#E8E9ED" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = BORDER_C)}
          />

          {loginError && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px]"
              style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", color: "#DC2626" }}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn || !password}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-[13px] font-bold tracking-[0.06em] text-black transition-opacity disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {isLoggingIn ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connexion…</> : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
