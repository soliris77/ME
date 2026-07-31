---
name: Current task checkpoint
description: Aucune tâche en cours — dernière session : Task #13 bouton « + Nouvelle liste » dans la barre d'onglets Watchlist, terminée
---

# Aucune tâche en cours

Dernière session terminée (2026-07-31) : Task #13 — bouton « + Nouvelle liste » (pastille pointillée) au bout de la barre d'onglets de la Watchlist ; input inline (Enter = créer, Échap = annuler), création persistée via POST /api/watchlist/lists (409 si doublon), liste active sélectionnée après création. Découverte : la table watchlist_lists n'existait pas en base — migration lib/db/migrations/0003_watchlist_lists.sql ajoutée (appliquée au démarrage par apply-migrations.mjs). Barre d'onglets désormais visible aussi quand la watchlist est vide mais que des listes persistées existent. Tests API 45/45 OK, typecheck OK.
