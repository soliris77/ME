#!/bin/sh
# Pousse le schéma Drizzle vers la DB sans interaction.
# Exécuté automatiquement par `pnpm run dev` au démarrage de l'API.
# Sur une DB vide (nouveau remix), aucune invite n'est affichée.
# Sur une DB existante, la touche Entrée sélectionne l'option par défaut
# (ajouter la contrainte sans tronquer la table).
set -e

DB_DIR="$(cd "$(dirname "$0")/../../.." && pwd)/lib/db"

printf '\n' | "$DB_DIR/node_modules/.bin/drizzle-kit" push --force \
  --config "$DB_DIR/drizzle.config.ts" \
  || true

echo "[db-push] Schéma synchronisé avec la base de données."
