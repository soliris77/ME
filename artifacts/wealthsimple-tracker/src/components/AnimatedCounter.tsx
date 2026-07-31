/**
 * AnimatedCounter — compteur animé pour les valeurs numériques
 * ──────────────────────────────────────────────────────────────────────────
 * Utilisé pour les prix, pourcentages, statistiques qui changent.
 * Transition douce entre les valeurs + pulse visuel sur changement.
 * Respecte prefers-reduced-motion : rend un span statique sans flash.
 */

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { counterVariants } from "@/lib/motion";
import { useEffect, useState } from "react";

interface AnimatedCounterProps {
  value: string | number;
  className?: string;
  flashOnChange?: boolean;
  flashColor?: "gain" | "loss" | "neutral";
}

export function AnimatedCounter({ 
  value, 
  className = "", 
  flashOnChange = false,
  flashColor = "neutral"
}: AnimatedCounterProps) {
  const reducedMotion = useReducedMotion();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!flashOnChange || reducedMotion) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 400);
    return () => clearTimeout(t);
  }, [value, flashOnChange, reducedMotion]);

  if (reducedMotion) {
    return <span className={`inline-block tabular-nums ${className}`}>{value}</span>;
  }

  const flashBg = 
    flashColor === "gain" ? "rgba(22,163,74,0.15)" :
    flashColor === "loss" ? "rgba(220,38,38,0.15)" :
    "rgba(212,167,44,0.12)";

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={String(value)}
        variants={counterVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        className={`inline-block tabular-nums ${className}`}
        style={{
          backgroundColor: flash ? flashBg : "transparent",
          borderRadius: "4px",
          padding: flash ? "2px 4px" : "0",
          transition: "background-color 0.4s ease-out, padding 0.3s ease-out"
        }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}
