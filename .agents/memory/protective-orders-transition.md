---
name: Transition des ordres protecteurs
description: Ordre validé pour remplacer la surveillance locale des stop-loss et take-profit.
---

Conserver temporairement la boucle protectrice existante pour les actions. Construire d’abord l’abstraction `BrokerAdapter`, puis l’adaptateur Kraken, avant de remplacer complètement cette boucle par des ordres protecteurs persistants chez le courtier.

**Why:** Le code actuel protège déjà les positions actions par une boucle locale et sait placer certains stops SnapTrade, mais ne possède pas encore l’interface nécessaire pour garantir une paire stop-loss/take-profit persistante et cohérente entre SnapTrade et Kraken. La supprimer immédiatement créerait une régression de protection.

**How to apply:** Traiter le Lot 3 puis le Lot 4 avant de reprendre le Lot 2. Lors du Lot 2 repris, migrer vers les ordres courtier et ne retirer la boucle locale que lorsque le chemin actions reste protégé et que les tests de réconciliation passent.