---
name: Hyperliquid balance accounts
description: Hyperliquid sépare les soldes Spot et Perps, et CCXT peut choisir Spot avec la marge unifiée.
---

Le solde Hyperliquid doit être lu en distinguant explicitement `swap` (Perps) et `spot`. Un appel CCXT `fetchBalance()` sans type peut retourner le compte Spot lorsque la marge unifiée est active, ce qui affiche zéro alors que le compte Perps contient des USDC.

**Why:** La réponse Hyperliquid expose plusieurs comptes de compensation et le choix implicite de CCXT ne correspond pas toujours au compte visible dans l’interface.

**How to apply:** Pour le risque Perps, appeler `fetchBalance({ type: "swap", enableUnifiedMargin: false })`. Pour l’affichage utilisateur, lire aussi `fetchBalance({ type: "spot" })` et présenter les deux montants séparément plutôt qu’un zéro ambigu.