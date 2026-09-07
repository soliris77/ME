/**
 * PageTransition — wrapper réutilisable pour toutes les pages
 * ──────────────────────────────────────────────────────────────────────────
 * Applique l'animation d'entrée fade-up + stagger pour le contenu.
 */

import { motion, useReducedMotion } from "framer-motion";
import { pageVariants, pageVariantsCinematic } from "@/lib/motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  variant?: "cinematic" | "soft";
}

export function PageTransition({
  children,
  className = "",
  variant = "cinematic",
}: PageTransitionProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial="initial"
      animate="enter"
      exit="exit"
      variants={variant === "soft" ? pageVariants : pageVariantsCinematic}
      className={className}
    >
      {children}
    </motion.div>
  );
}
