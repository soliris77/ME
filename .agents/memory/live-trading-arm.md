---
name: Armement temporaire du live
description: Règle de sécurité durable encadrant toute transmission d’ordre réel.
---

Le mode live doit rester inutilisable sans armement temporaire explicite lié à un compte, avec plafond par ordre, perte journalière maximale et expiration bornée. Toute donnée absente, expirée ou invérifiable bloque l’ordre.

**Why:** Un simple indicateur global « live » peut survivre à l’intention de l’utilisateur et permettre une transaction réelle longtemps après son activation.

**How to apply:** Toute nouvelle voie de soumission doit passer par le moteur central et ses contrôles d’armement. Le mode paper doit désarmer le live, et aucun test automatisé ne doit appeler réellement le courtier.