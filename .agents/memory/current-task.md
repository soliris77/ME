---
name: Current task checkpoint
description: Aucune tâche en cours
---

# Aucune tâche en cours

Dernière tâche terminée : #44 Analyse pédagogique de chaque trade.
Détail durable : moteur pur `analyzeDayTrades` dans api-server `src/lib/tradeAnalysis.ts`
(lecture seule) — réutilise les mêmes seuils que les garde-fous (maxOrderValue,
friction, ACTIVE_STOP_STATUSES, coût moyen du coupe-circuit, seuil 80 %).
Exposé via `analysis` sur chaque ordre de /api/debrief, affiché dans Debrief.tsx.
