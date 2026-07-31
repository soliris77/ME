---
name: getQuotes ne rejette jamais
description: getQuotes avale les erreurs Yahoo et renvoie une liste (partielle ou vide) — les garde-fous doivent fail closed sur cotation manquante.
---

# getQuotes ne rejette jamais

Règle : ne jamais ignorer un symbole sans cotation dans un calcul de risque (exposition, limites). Une cotation absente doit refuser l'opération.

**Pourquoi :** getQuotes intercepte les erreurs Yahoo et renvoie simplement moins de cotations au lieu de rejeter. Un `if (!quote) continue` sous-estime l'exposition et laisse passer des ordres dangereux.

**Comment l'appliquer :** dans tout code de risque consommant getQuotes, traiter « cotation manquante pour une position ouverte » comme une erreur ferme (fail closed), et tester ce cas avec getQuotes résolvant `[]` ou une liste partielle — pas seulement un mock qui rejette.
