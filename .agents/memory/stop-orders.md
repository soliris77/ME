---
name: Ordres stop de protection
description: Règles fail-closed pour les ordres stop SELL soumis au courtier
---

# Ordres stop de protection — règles fail-closed

- Un stop SELL doit être **strictement sous le prix courant** (validé côté serveur contre le prix live du pipeline de risque, pas seulement côté UI). Un stop ≥ marché se déclenche immédiatement = vente market déguisée.
  **Why:** données UI potentiellement périmées ; toute intégration future ou appel API direct pourrait sinon vendre immédiatement.
- Au boundary HTTP, `orderType` inconnu ⇒ 400, jamais de repli silencieux vers "market". Seule l'absence du champ vaut market.
  **How to apply:** toute nouvelle valeur d'ordre (limit, stop-limit…) doit être ajoutée explicitement à la liste blanche de la route ET au moteur d'ordres.
