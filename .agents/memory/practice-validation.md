---
name: Validation des exercices pratiques
description: Comment le badge « Exercice fait » du parcours guidé est vérifié côté serveur
---

# Validation des exercices pratiques du parcours

Règle : chaque leçon a un critère serveur dans `getPracticeStatuses()` (api-server lib/practiceValidation), basé sur les vraies données (alertes, ordres stop SELL, règles auto-trader, journal des ordres) OU sur la table `practice_events` (tool + created_at).

**Pourquoi :** certains outils ne laissent aucune trace en base (calculateur, page corrélation) et d'autres sont des agrégations en lecture seule (débriefing, performance). Les événements comblent ce vide : POST `/api/learn-practice/events` pour les outils client (whitelist calculator / calculator-rr / correlation), enregistrement serveur fire-and-forget dans les routes GET debrief (jour courant seulement) et performance.

**Comment appliquer :** toute nouvelle leçon (voir tâche d'enrichissement du parcours) doit ajouter son entrée dans `getPracticeStatuses()` avec le même slug que `parcoursContent.ts` — la liste des slugs doit rester alignée entre les deux fichiers. Le débriefing utilise la convention UTC de début de journée (même que le coupe-circuit).
