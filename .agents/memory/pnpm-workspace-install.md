---
name: Installation pnpm du workspace
description: Repli sûr quand la reliaison des packages locaux échoue en mode hors ligne.
---

Un `pnpm install --offline` peut échouer même si tous les paquets sont déjà dans le store local, car les métadonnées du registre filtré peuvent manquer pour une dépendance transitive existante.

**Why:** Deux tentatives hors ligne ont échoué sur des métadonnées différentes alors qu’un `pnpm install` normal n’a téléchargé aucun paquet et a relié le workspace correctement.

**How to apply:** Pour relier un nouveau package `workspace:*`, essayer le mode hors ligne une fois. Si l’erreur est `ERR_PNPM_NO_OFFLINE_META`, utiliser ensuite le registre pnpm géré normalement sans modifier les versions ni contourner le pare-feu.