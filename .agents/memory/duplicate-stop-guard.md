---
name: Anti-empilement des stops de protection
description: Pourquoi et comment un second stop actif pour le même symbole+compte est rejeté (serveur + UI)
---

# Anti-empilement des ordres stop de protection

**Règle :** un seul stop de protection actif (statuts pending/submitted/simulated —
voir `ACTIVE_STOP_STATUSES` exporté par orderEngine) par symbole ET par compte.
Une nouvelle soumission est rejetée avec la raison `duplicate_stop`.

**Why:** l'idempotence par signalId ne couvre pas le cas « fermer le modal,
racheter, resoumettre » — chaque montage du modal génère un nouveau signalId.
Deux stops empilés doubleraient silencieusement la quantité vendue au
déclenchement.

**How to apply:**
- La politique de correspondance de compte doit rester identique côté serveur
  (garde-fou dans submitOrder) et côté UI (avertissement TradeModal) : comptes
  différents = positions différentes → pas un doublon ; compte inconnu d'un
  côté → bloquant (fail closed).
- `ACTIVE_STOP_STATUSES` doit rester aligné avec le drapeau `active` de
  GET /api/broker/stop-orders.
- Limite connue : le SELECT-avant-INSERT laisse une fenêtre de course pour deux
  soumissions strictement simultanées — la fermer exige un index unique partiel
  en DB (même approche que le verrou signalId).
