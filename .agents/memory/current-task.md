---
name: Current task checkpoint
description: Aucune tâche en cours
---

# Aucune tâche en cours

Dernière tâche terminée : #56 Demi-journées de bourse (fermeture anticipée 13h ET).
Détail durable : `getEarlyCloseDays(year, exchange)` dans api-server `src/lib/risk.ts` —
candidats (3 juillet + lendemain de Thanksgiving US pour NASDAQ/NYSE ; 24 décembre pour
les deux bourses) filtrés : week-ends exclus et jours déjà fériés observés exclus
(ex. 3 juillet 2026 = férié observé, pas demi-journée). isMarketOpen ferme à 13h00 ET
ces jours-là avec un message explicite.
