---
name: Contrat de confirmation des ventes protectrices
description: Pourquoi "accepted" de submitOrder ne veut PAS dire vente réussie, et comment tester la logique financière sans DB
---

# Contrat submitOrder ↔ sorties protectrices

- **Règle :** `submitOrder` peut renvoyer `status: "accepted"` avec un ordre `order.status === "error"` (échec de l'appel courtier en mode live). Toute logique qui efface un état de position doit vérifier `order.status !== "error"`, jamais seulement `accepted`/`duplicate`.
- **Why:** une position réelle resterait ouverte sans suivi SL/TP/trailing (revue de code a rejeté une première version qui assimilait accepted à confirmé).
- **How to apply:** les identifiants de signal de sortie doivent être stables par position (pas de `Date.now()` dans l'id de base) pour que l'idempotence fonctionne entre cycles ; un duplicate pointant sur un ordre en erreur doit être re-soumis avec un id de reprise dérivé.

# Tests sans DB

- `pnpm --filter @workspace/api-server test` (vitest ; aussi enregistré comme validation "test").
- Mocker `@workspace/db` (sentinelles de table + faux db qui enregistre select/update/insert) **et** `drizzle-orm` (`eq`/`and`/`gte` → objets simples), sinon drizzle rejette les colonnes factices.
- Backtest : mocker `./signals` avec une map close→score (`vi.hoisted`) ; warmup 55 barres.
