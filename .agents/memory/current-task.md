---
name: Current task checkpoint
description: Aucune tâche en cours — dernière session : Task #6 historique des notifications, terminée
---

# Aucune tâche en cours

Dernière session terminée (2026-07-31) : centre de notifications — table `notifications` (migration 0002), journalisation dans alertWorker à chaque déclenchement (prix/pattern/signal), routes /api/notifications (+ unread-count + mark-all-read), section « Historique des notifications » sur /alerts (heure exacte, canaux, badges non lu, mark-all-read à la consultation), badge non lu sur l'entrée Alertes de la sidebar. Corrigé au passage : tsconfig.json racine recréé (avait été supprimé), TS2308 pré-existant dans lib/api-zod/src/index.ts, erreur TS dans webPush.ts. Vérifié : typecheck complet, 45 tests, migration appliquée, routes montées (401 sans session).
