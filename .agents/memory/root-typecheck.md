---
name: Typecheck racine fragile
description: tsconfig.json racine indispensable au typecheck et au codegen orval ; conflits TS2308 dans lib/api-zod résolus par ré-export type explicite
---

# Typecheck racine

**Règle :** `pnpm typecheck` (et `pnpm codegen` dans lib/api-spec, qui l'enchaîne) exige un `tsconfig.json` à la racine — un tsconfig « solution » qui référence `lib/db`, `lib/api-client-react`, `lib/api-zod`.

**Why :** ce fichier a déjà été supprimé par erreur (commit « Saved progress at the end of the loop »), cassant silencieusement typecheck:libs et le codegen pendant plusieurs sessions.

**How to apply :** si `tsc --build` se plaint de tsconfig.json introuvable, le recréer (extends ./tsconfig.base.json, files: [], references vers les 3 libs).

Aussi : orval génère parfois le même nom en *valeur zod* (generated/api) et en *type* (generated/types) → TS2308 dans `lib/api-zod/src/index.ts`. Solution : garder les deux `export *` et ajouter un `export type { … } from "./generated/types"` explicite pour les noms en conflit.
