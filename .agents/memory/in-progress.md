---
name: In-progress agent task
description: TÂCHE EN COURS — reprendre immédiatement avant tout autre travail
---

# ⚠️ TÂCHE EN COURS — À REPRENDRE EN PRIORITÉ

> **Pour tout nouvel agent démarrant dans ce projet :**
> Lis ce fichier AVANT de commencer quoi que ce soit.
> Une tâche a été interrompue (limite d'utilisation atteinte) et doit être reprise.
> Appelle `GET /api/agent-tasks` pour les détails complets depuis la base de données.

## ⏸️ EN PAUSE — Test de vérification du système (ID: 1)

**Instructions d'origine :**
Tâche de démonstration : valide que la table agent_tasks existe et que les données persistent.

**✅ Étapes déjà complétées :**
- Créé le schéma DB agentTasksTable
- Ajouté les routes API /api/agent-tasks
- Créé la page frontend /agent-tasks

**➡️ PROCHAINES ÉTAPES (reprendre ici) :**
- Vérifier affichage dans l'interface
- Tester depuis un remix

**📝 Notes techniques de reprise :**
```
Table créée via psql direct (migration drizzle-kit ne fonctionne pas sans TTY).
Route API dans artifacts/api-server/src/routes/agentTasks.ts.
Page frontend dans artifacts/wealthsimple-tracker/src/pages/AgentTasks.tsx.
```

*Statut: paused*

---
