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
import { motion, AnimatePresence } from "framer-motion";
import { EASE_PRECISION } from "@/lib/motion";

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
      <motion.div
        className="w-full max-w-[380px] p-8 rounded-xl"
        style={{ background: SURFACE, border: `1px solid ${BORDER_C}`, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE_PRECISION }}
      >
        <motion.div 
          className="flex flex-col items-center text-center mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: EASE_PRECISION }}
        >
          <motion.img
            src="/soliris-icon.svg"
            alt="Soliris Market"
            className="w-16 h-16 object-contain mb-4 drop-shadow-[0_0_12px_rgba(212,167,44,0.3)]"
            initial={{ scale: 0.8, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: EASE_PRECISION }}
          />
          <motion.h1 
            className="brand-mark text-[15px] tracking-[0.24em]" 
            style={{ color: ACCENT }}
            initial={{ opacity: 0, letterSpacing: "0.4em" }}
            animate={{ opacity: 1, letterSpacing: "0.24em" }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            SOLIRIS MARKET
          </motion.h1>
          <motion.p 
            className="text-[12px] mt-2" 
            style={{ color: MUTED }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            Accès protégé — entrez le mot de passe pour continuer.
          </motion.p>
        </motion.div>

        <motion.form 
          onSubmit={onSubmit} 
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          <motion.input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            className="w-full rounded-lg px-4 py-3 text-[14px] focus:outline-none transition-all"
            style={{ background: BASE_BG, border: `1px solid ${BORDER_C}`, color: "#E8E9ED" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = BORDER_C)}
            whileFocus={{ scale: 1.01 }}
          />

          <AnimatePresence mode="wait">
            {loginError && (
              <motion.div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px]"
                style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.28)", color: "#DC2626" }}
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.3, ease: EASE_PRECISION }}
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                {loginError}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={isLoggingIn || !password}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-[13px] font-bold tracking-[0.06em] text-black transition-all disabled:opacity-50"
            style={{ background: ACCENT }}
            whileHover={{ scale: !isLoggingIn && password ? 1.02 : 1 }}
            whileTap={{ scale: !isLoggingIn && password ? 0.98 : 1 }}
          >
            {isLoggingIn ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connexion…</> : "Se connecter"}
          </motion.button>
        </motion.form>
      </motion.div>
    </div>
  );
}
