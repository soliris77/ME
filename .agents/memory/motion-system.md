---
name: Motion system frontend
description: Conventions d'animation framer-motion du frontend wealthsimple-tracker
---

Le frontend a une bibliothèque de motion partagée : `src/lib/motion.ts` (variants + easings `as const`), `PageTransition`, `AnimatedCounter` (prix live avec flash gain/perte).

**Règles :**
- prefers-reduced-motion n'est PAS automatique avec framer-motion : `<MotionConfig reducedMotion="user">` est monté à la racine dans App.tsx, et `AnimatedCounter` utilise `useReducedMotion` pour rendre un span statique (les prix se rafraîchissent toutes les 10-30s — sans ça, motion permanente).
- Les easings cubic-bezier en tableau doivent être `as const`, sinon erreur TS `number[]` vs `Easing`.
- **Pourquoi :** revue d'architecte de juillet 2026 a signalé la non-conformité reduced-motion comme bloquante sur les données live.
