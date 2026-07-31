---
name: Migrations DB non interactives
description: Décision — tout changement de schéma passe par une migration SQL versionnée ; drizzle-kit push n'est pas fiable au démarrage
---

# Décision : migrations SQL versionnées, jamais de drizzle-kit push seul

Tout changement de schéma doit être livré comme une migration SQL idempotente versionnée dans `lib/db/migrations/`, appliquée automatiquement au démarrage de l'API (échec = démarrage bloqué, jamais masqué).

**Why :** `drizzle-kit push` exige un TTY pour ses prompts (nouvelle table, contraintes…) et le démarrage l'exécutait en best-effort : l'échec était masqué et le schéma silencieusement non appliqué — routes cassées avec « column does not exist » en production/remix.

**How to apply :** après modification de `lib/db/src/schema`, ajouter un fichier `NNNN_description.sql` idempotent (IF NOT EXISTS, contraintes uniques nommées `<table>_<col>_unique` — convention drizzle pour éviter un diff). Rebuilder aussi les types (`tsc -b` dans lib/db) sinon le typecheck des consommateurs voit les anciens `.d.ts` (références de projet composites).

**Complément (juillet 2026)** : un DDL psql ponctuel ne suffit pas pour un nouvel environnement — toujours ajouter aussi une migration versionnée dans `lib/db/migrations/NNNN_*.sql` (le runner la rejouera), en plus du psql immédiat + rebuild.
