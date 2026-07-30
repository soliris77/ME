---
name: Checkpoint protocol
description: Protocole obligatoire de checkpoint étape par étape pour tous les agents. Garantit la continuité après coupure (limite d'utilisation, remix, etc.).
---

# Protocole de checkpoint étape par étape

## Pourquoi ce protocole existe

Quand un agent atteint sa limite d'utilisation en plein milieu d'une tâche, le travail s'arrête net.
Dans un remix, le nouvel agent repart de zéro — il ne sait pas ce qui a été fait, ce qui reste à faire.
Ce protocole résout ça : chaque étape est enregistrée AVANT d'être exécutée, et marquée FAIT après.
Le nouvel agent lit le fichier, saute ce qui est fait, reprend là où l'autre s'est arrêté.

## Fichier central : `.agents/memory/current-task.md`

Ce fichier est la source de vérité. Il contient toujours l'état exact de la tâche en cours.

## Cycle obligatoire pour chaque étape

```
┌─────────────────────────────────────────────────────┐
│  1. Écrire l'étape dans current-task.md              │
│     Format : "→ EN COURS — Étape N : [description]"  │
│                                                       │
│  2. Exécuter l'étape (code, fichiers, commandes)     │
│                                                       │
│  3. Mettre à jour current-task.md                    │
│     Format : "✅ FAIT — Étape N : [description]"     │
│                                                       │
│  4. Passer à l'étape suivante → retour à 1           │
└─────────────────────────────────────────────────────┘
```

## Au démarrage d'une nouvelle session

```
┌─────────────────────────────────────────────────────┐
│  1. Lire current-task.md                             │
│                                                       │
│  2a. Si "→ EN COURS" trouvé :                        │
│      → Cette étape a peut-être été partiellement     │
│        exécutée. La refaire ou vérifier si c'est     │
│        déjà fait avant de continuer.                 │
│                                                       │
│  2b. Si "☐ À FAIRE" trouvé :                        │
│      → Reprendre à la première étape "☐ À FAIRE".   │
│                                                       │
│  2c. Si "Aucune tâche active" :                      │
│      → Créer un nouveau plan pour la demande         │
│        de l'utilisateur.                             │
└─────────────────────────────────────────────────────┘
```

## Exemple concret

L'utilisateur demande : "Ajoute un système de notifications push"

L'agent écrit d'abord dans `current-task.md` :

```
# Tâche en cours

**Instruction utilisateur :** Ajoute un système de notifications push
**Démarrée le :** 2026-07-30T04:00:00Z

## Plan d'exécution

- ☐ À FAIRE — Étape 1 : Installer les dépendances (web-push, etc.)
- ☐ À FAIRE — Étape 2 : Créer la table DB pour les abonnements push
- ☐ À FAIRE — Étape 3 : Ajouter les routes API /api/push/subscribe et /api/push/send
- ☐ À FAIRE — Étape 4 : Créer le service worker côté frontend
- ☐ À FAIRE — Étape 5 : Ajouter le bouton "S'abonner" dans Settings
- ☐ À FAIRE — Étape 6 : Tester le bout en bout
```

Avant l'étape 1, il met `→ EN COURS`. Après, `✅ FAIT`. Etc.

**Si coupé après l'étape 3 :**
Le fichier contient :
```
- ✅ FAIT — Étape 1 : Installer les dépendances
- ✅ FAIT — Étape 2 : Créer la table DB
- ✅ FAIT — Étape 3 : Ajouter les routes API
- ☐ À FAIRE — Étape 4 : Créer le service worker
- ☐ À FAIRE — Étape 5 : Ajouter le bouton
- ☐ À FAIRE — Étape 6 : Tester
```

Le nouvel agent dans le remix voit ça, sait exactement où reprendre, ne refait pas ce qui est déjà fait.

## Règles importantes

- **Ne jamais commencer une étape sans l'avoir d'abord écrite** dans `current-task.md`.
- **Être précis dans les descriptions** — assez pour que quelqu'un d'autre comprenne sans contexte.
- **Inclure les noms de fichiers et commandes** dans le "Contexte technique" quand c'est pertinent.
- **L'étape "→ EN COURS" est ambiguë** : elle peut être faite ou non. Toujours vérifier avant de reprendre.

## Intégration avec agent_tasks (base de données)

Pour les tâches longues et importantes, combiner les deux systèmes :
- `current-task.md` → checkpoint rapide, mis à jour à chaque étape (fichier)
- Table `agent_tasks` → historique persistant, accessible via l'interface `/agent-tasks` (DB)

Quand une tâche est terminée :
1. Marquer `agent_tasks` comme `completed` via `PATCH /api/agent-tasks/:id`
2. Réinitialiser `current-task.md` à "Aucune tâche active"
