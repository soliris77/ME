/**
 * Motion utilities — Soliris Market Tracker
 * ──────────────────────────────────────────────────────────────────────────
 * Réutilisables framer-motion variants + hooks pour une cohérence totale.
 * prefers-reduced-motion est respecté via <MotionConfig reducedMotion="user">
 * monté à la racine de l'app (App.tsx) + useReducedMotion dans AnimatedCounter.
 */

import { type Variants } from "framer-motion";

// ─── Easing curves ─────────────────────────────────────────────────────────
export const EASE_PRECISION = [0.22, 1, 0.36, 1] as const; // var(--ease-precision) en JS
export const EASE_SNAP = [0.4, 0, 0.2, 1] as const;
export const EASE_SMOOTH = [0.65, 0, 0.35, 1] as const;

// ─── Page transitions ──────────────────────────────────────────────────────
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.45, ease: EASE_PRECISION }
  },
  exit: { 
    opacity: 0, 
    y: -8,
    transition: { duration: 0.3, ease: EASE_SNAP }
  }
};

// ─── Stagger containers ────────────────────────────────────────────────────
export const staggerContainer: Variants = {
  initial: {},
  enter: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.08,
    }
  }
};

export const staggerContainerFast: Variants = {
  initial: {},
  enter: {
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.05,
    }
  }
};

// ─── Card / List item entrance ─────────────────────────────────────────────
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  enter: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: EASE_PRECISION }
  }
};

export const listItemVariants: Variants = {
  initial: { opacity: 0, x: -8 },
  enter: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.35, ease: EASE_PRECISION }
  }
};

// ─── Hover lift (cards, buttons) ───────────────────────────────────────────
export const hoverLift = {
  rest: { y: 0, scale: 1 },
  hover: { 
    y: -2, 
    scale: 1.01,
    transition: { duration: 0.3, ease: EASE_PRECISION }
  }
};

export const hoverScale = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.03,
    transition: { duration: 0.25, ease: EASE_SMOOTH }
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 }
  }
};

// ─── Modal / Dialog ────────────────────────────────────────────────────────
export const modalBackdropVariants: Variants = {
  initial: { opacity: 0 },
  enter: { 
    opacity: 1,
    transition: { duration: 0.2 }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.15 }
  }
};

export const modalContentVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  enter: { 
    opacity: 1, 
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_PRECISION }
  },
  exit: { 
    opacity: 0, 
    scale: 0.98,
    y: 4,
    transition: { duration: 0.2, ease: EASE_SNAP }
  }
};

// ─── Number counter (prix, valeurs) ────────────────────────────────────────
export const counterVariants: Variants = {
  initial: { opacity: 0, y: -4 },
  enter: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.25, ease: EASE_SNAP }
  },
  exit: { 
    opacity: 0, 
    y: 4,
    transition: { duration: 0.2, ease: EASE_SNAP }
  }
};

// ─── Toast / Notification ──────────────────────────────────────────────────
export const toastVariants: Variants = {
  initial: { opacity: 0, x: 100, scale: 0.9 },
  enter: { 
    opacity: 1, 
    x: 0,
    scale: 1,
    transition: { 
      duration: 0.4, 
      ease: EASE_PRECISION,
      scale: { duration: 0.25 }
    }
  },
  exit: { 
    opacity: 0, 
    x: 60,
    scale: 0.95,
    transition: { duration: 0.25, ease: EASE_SNAP }
  }
};

// ─── Badge pulse (alertes actives) ─────────────────────────────────────────
export const badgePulse: Variants = {
  initial: { scale: 1 },
  pulse: {
    scale: [1, 1.12, 1],
    transition: {
      duration: 0.5,
      ease: EASE_SMOOTH,
      repeat: Infinity,
      repeatDelay: 2
    }
  }
};

// ─── Success / Error flash ─────────────────────────────────────────────────
export const flashSuccess: Variants = {
  initial: { backgroundColor: "transparent", scale: 1 },
  flash: {
    backgroundColor: ["transparent", "rgba(22,163,74,0.15)", "transparent"],
    scale: [1, 1.02, 1],
    transition: { duration: 0.6, ease: EASE_SMOOTH }
  }
};

export const flashError: Variants = {
  initial: { backgroundColor: "transparent", scale: 1 },
  flash: {
    backgroundColor: ["transparent", "rgba(220,38,38,0.15)", "transparent"],
    scale: [1, 1.02, 1],
    transition: { duration: 0.6, ease: EASE_SMOOTH }
  }
};

// ─── Skeleton shimmer ──────────────────────────────────────────────────────
export const shimmerVariants: Variants = {
  initial: { x: "-100%" },
  shimmer: {
    x: "100%",
    transition: {
      duration: 1.5,
      ease: "linear",
      repeat: Infinity,
      repeatDelay: 0.5
    }
  }
};

// ─── Value change indicator (prix qui monte/descend) ───────────────────────
export const priceChangeVariants: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  enter: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.3, ease: EASE_SNAP }
  },
  // Utilisé avec AnimatePresence + key={price} pour transition smooth
};

// ─── Drawer slide-in (mobile, side panels) ─────────────────────────────────
export const drawerVariants: Variants = {
  initial: { x: "100%" },
  enter: { 
    x: 0,
    transition: { duration: 0.4, ease: EASE_PRECISION }
  },
  exit: { 
    x: "100%",
    transition: { duration: 0.3, ease: EASE_SNAP }
  }
};

// ─── Collapse / Expand (sections) ──────────────────────────────────────────
export const collapseVariants: Variants = {
  collapsed: { 
    height: 0, 
    opacity: 0,
    transition: { duration: 0.3, ease: EASE_SNAP }
  },
  expanded: { 
    height: "auto", 
    opacity: 1,
    transition: { 
      height: { duration: 0.4, ease: EASE_PRECISION },
      opacity: { duration: 0.25, delay: 0.1 }
    }
  }
};

// ─── Gold glow pulse (actions premium) ─────────────────────────────────────
export const goldGlowVariants: Variants = {
  initial: { 
    boxShadow: "0 0 0 0 rgba(212,167,44,0)" 
  },
  glow: {
    boxShadow: [
      "0 0 0 0 rgba(212,167,44,0)",
      "0 0 20px 4px rgba(212,167,44,0.3)",
      "0 0 0 0 rgba(212,167,44,0)"
    ],
    transition: {
      duration: 1.5,
      ease: EASE_SMOOTH,
      repeat: Infinity,
      repeatDelay: 1
    }
  }
};
