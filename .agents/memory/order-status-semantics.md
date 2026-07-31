---
name: Sémantique des statuts d'ordres
description: Quels statuts de la table orders comptent comme une exécution réelle selon le mode
---

# Statuts d'ordres : « submitted » n'est pas « exécuté »

Règle : dans toute métrique qui prétend refléter des trades réellement passés (P&L, discipline, R réalisé), un ordre live ne compte comme exécuté que s'il est `filled`/`partially_filled` ; en paper, `simulated` vaut exécution instantanée. Un ordre `submitted` (surtout un stop GTC au repos) n'a pas encore changé la position. Utiliser `fillPrice`/`filledQuantity` quand ils existent, `expectedPrice` seulement en repli.

**Why :** une revue de code a rejeté le score de discipline parce qu'il appariait des ordres live `submitted` comme des trades clôturés au prix indicatif — scores et R matériellement faux.

**How to apply :** tout nouveau calcul basé sur la table `orders` doit filtrer par exécution réelle selon le mode, pas par la liste large `["simulated","submitted","filled","partially_filled"]` héritée de lib/performance.ts.
