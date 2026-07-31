---
name: Suggestion de stop-loss
description: Règles pour toute suggestion basée sur un « plus bas N jours »
---

Un libellé « plus bas 20 jours » exige exactement ce qu'il annonce : un historique QUOTIDIEN dédié (pas la plage visible du graphique) ET au moins 20 bougies quotidiennes valides. Sinon, retomber explicitement sur le fallback annoncé (« -2 % sous l'entrée »).

**Why:** les plages longues du graphique renvoient des bougies hebdo/mensuelles, et les titres récents n'ont pas 20 jours d'historique — dans les deux cas le libellé devient mensonger pour un défaut de gestion du risque. Le code review de complétion rejette tout écart libellé/donnée de ce type.

**How to apply:** vérifier la granularité réelle des bougies et le nombre de points valides avant d'apposer un libellé quantitatif ; ne pas inventer de seuils produits non demandés (ex. cutoff de distance).
