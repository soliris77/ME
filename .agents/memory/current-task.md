---
name: Current task checkpoint
description: Journal pas-à-pas de la tâche en cours. Mis à jour avant et après chaque action. À lire en PREMIER au démarrage de chaque session.
---

# Aucune tâche active

Aucun travail en cours. Ce fichier est remplacé automatiquement dès qu'un agent commence une nouvelle tâche.

---

## FORMAT À UTILISER (référence)

```
# Tâche en cours

**Instruction utilisateur :** [copier-coller exact de ce que l'utilisateur a demandé]
**Démarrée le :** [date ISO]

## Plan d'exécution

- ✅ FAIT — Étape 1 : [description de ce qui a été fait]
- ✅ FAIT — Étape 2 : [description]
- → EN COURS — Étape 3 : [description de ce qui est en train d'être fait]
- ☐ À FAIRE — Étape 4 : [description]
- ☐ À FAIRE — Étape 5 : [description]

## Contexte technique
[Notes importantes pour reprendre : fichiers modifiés, décisions prises, commandes à relancer, etc.]
```

## RÈGLES POUR TOUS LES AGENTS

1. **Au démarrage :** lire ce fichier EN PREMIER. Si une étape est `→ EN COURS` ou `☐ À FAIRE`, reprendre là.
2. **Avant chaque étape :** marquer `→ EN COURS` dans ce fichier, puis exécuter.
3. **Après chaque étape :** marquer `✅ FAIT`.
4. **Si l'étape était déjà `✅ FAIT` :** ne pas la refaire, passer à la suivante.
5. **Quand tout est terminé :** remplacer ce fichier par "Aucune tâche active".
