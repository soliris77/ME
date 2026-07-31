---
name: Règles de répartition du portefeuille
description: Contrats de données SnapTrade et politique FX/secteur pour tout calcul de répartition ou de valeur de portefeuille.
---

# Règles durables — répartition / valorisation du portefeuille

- **Devise d'une position SnapTrade** : utiliser `Position.currency.code` (devise de `price`),
  PAS la devise de cotation `symbol.symbol.currency` — elles peuvent différer (ex. titre coté USD détenu en CAD).
- **Équivalents de trésorerie** : les positions `cash_equivalent: true` (fonds monétaires) sont déjà
  comptées dans le solde cash (`Balance.cash`) — les inclure dans l'investi les compte deux fois.
- **Soldes** : `getUserAccountBalance` (SDK 10.x) renvoie `Balance[]` avec `currency.code` + `cash` top-level.
- **Taux de change manquant** : exclure les montants des totaux CAD + avertissement explicite (`fxWarning`),
  jamais de conversion 1:1 silencieuse.
- **Secteur inconnu / FNB** : libellé explicite (« Secteur inconnu », « FNB / Fonds ») — jamais un secteur inventé.

**Why:** un mauvais choix de devise ou un double comptage fausse silencieusement toutes les répartitions et métriques de risque.
**How to apply:** toute nouvelle route ou calcul consommant positions/soldes SnapTrade ou convertissant en CAD.
