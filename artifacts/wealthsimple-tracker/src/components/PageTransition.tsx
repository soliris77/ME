/**
 * PageTransition — wrapper réutilisable pour toutes les pages
 * ──────────────────────────────────────────────────────────────────────────
 * Applique l'animation d'entrée fade-up + stagger pour le contenu.
 */

import { motion } from "framer-motion";
import { pageVariants } from "@/lib/motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="enter"
      exit="exit"
      variants={pageVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
