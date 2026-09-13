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
export const EASE_ENTRANCE = [0.16, 1, 0.3, 1] as const;
export const EASE_EXIT = [0.4, 0, 1, 1] as const;

// ─── Premium reveal system ─────────────────────────────────────────────────
export const DUR = {
  instant: 0.09,
  fast: 0.18,
  base: 0.32,
  slow: 0.56,
  cinematic: 0.9,
} as const;

export const STAGGER = {
  tight: 0.028,
  base: 0.055,
  wide: 0.09,
} as const;

export const REVEAL_VIEWPORT = {
  once: true,
  amount: 0.2,
  margin: "0px 0px -12% 0px",
} as const;

export type RevealDirection = "up" | "down" | "left" | "right" | "scale" | "fade";

const REVEAL_OFFSETS: Record<RevealDirection, { x?: number; y?: number; scale?: number }> = {
  up: { y: 28 },
  down: { y: -28 },
  left: { x: 32 },
  right: { x: -32 },
  scale: { scale: 0.94 },
  fade: {},
};

export function revealVariants(
  direction: RevealDirection = "up",
  distance = 1,
  duration: number = DUR.slow,
): Variants {
  const offset = REVEAL_OFFSETS[direction];
  return {
    initial: {
      opacity: 0,
      x: (offset.x ?? 0) * distance,
      y: (offset.y ?? 0) * distance,
      scale: offset.scale ?? 1,
    },
    enter: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: { duration, ease: EASE_PRECISION },
    },
  };
}

export function staggerGroup(
  speed: keyof typeof STAGGER = "base",
  delayChildren = 0.06,
): Variants {
  return {
    initial: {},
    enter: {
      transition: { staggerChildren: STAGGER[speed], delayChildren },
    },
  };
}

export const pageVariantsCinematic: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.985, filter: "blur(6px)" },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: DUR.slow, ease: EASE_ENTRANCE },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.99,
    filter: "blur(4px)",
    transition: { duration: DUR.fast, ease: EASE_EXIT },
  },
};

export const drawVariants: Variants = {
  initial: { pathLength: 0, opacity: 0 },
  enter: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: DUR.cinematic, ease: EASE_PRECISION },
      opacity: { duration: DUR.fast },
    },
  },
};

export const drawAreaVariants: Variants = {
  initial: { opacity: 0 },
  enter: {
    opacity: 1,
    transition: { duration: DUR.slow, delay: DUR.base, ease: EASE_ENTRANCE },
  },
};

export const rollVariants: Variants = {
  initial: (direction: number) => ({ opacity: 0, y: direction >= 0 ? 14 : -14 }),
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.base, ease: EASE_PRECISION },
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction >= 0 ? -14 : 14,
    transition: { duration: DUR.fast, ease: EASE_EXIT },
  }),
};

export const TILT = {
  maxRotate: 6,
  perspective: 900,
  scale: 1.015,
  spring: { stiffness: 220, damping: 26, mass: 0.6 },
} as const;

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

// --- Preference de mouvement ---------------------------------------
//
// prefers-reduced-motion reste la valeur par defaut. Quand la personne
// demande explicitement le mouvement dans la barre laterale, on pose
// data-motion="full" sur <html> : le CSS leve alors ses blocs de
// reduction, et MotionConfig passe de "user" a "never". Rien n'est
// change sur le systeme ni sur les autres sites.
//
// Le module lit la valeur au chargement, avant le premier rendu, pour
// qu'aucun composant ne demarre sur une valeur fausse.

export type MotionPreference = "system" | "full";

const MOTION_KEY = "motion";
const motionListeners = new Set<(value: MotionPreference) => void>();

function readStoredMotion(): MotionPreference {
  try {
    return localStorage.getItem(MOTION_KEY) === "full" ? "full" : "system";
  } catch {
    return "system";
  }
}

function applyMotion(value: MotionPreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-motion", value);
}

let motionPreference: MotionPreference =
  typeof document === "undefined" ? "system" : readStoredMotion();
applyMotion(motionPreference);

/** Vrai quand la personne a demande le mouvement malgre le reglage systeme. */
export function isMotionForced(): boolean {
  return motionPreference === "full";
}

/** Change la preference, l'applique au document et la retient. */
export function setMotionForced(forced: boolean): void {
  motionPreference = forced ? "full" : "system";
  applyMotion(motionPreference);
  try {
    localStorage.setItem(MOTION_KEY, motionPreference);
  } catch {
    // stockage indisponible : la preference vaut pour cette session
  }
  for (const listener of motionListeners) listener(motionPreference);
}

/** S'abonne aux changements. Renvoie la fonction de desabonnement. */
export function subscribeMotion(
  listener: (value: MotionPreference) => void,
): () => void {
  motionListeners.add(listener);
  return () => { motionListeners.delete(listener); };
}
