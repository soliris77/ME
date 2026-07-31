#!/bin/bash
set -e

# Post-merge setup — idempotent, non-interactif.
cd "$(dirname "$0")/.."

# 1. Dépendances (monorepo pnpm)
pnpm install --prefer-offline

# 2. Reconstruire les déclarations de lib/db (project reference TS — dist/*.d.ts peuvent être périmés)
./node_modules/.bin/tsc --build --force lib/db || true

# 3. Synchroniser le schéma DB (script tolérant, non interactif)
(cd artifacts/api-server && pnpm run db:push) || true
