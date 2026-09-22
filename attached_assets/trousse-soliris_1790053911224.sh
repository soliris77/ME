#!/usr/bin/env bash
#
# trousse-soliris.sh — fabrique UNE archive contenant tout Soliris Market :
# le code, la base de données, et les secrets. De quoi remonter le site
# ailleurs sans rien retaper.
#
# À lancer dans le Shell Replit :
#     bash ~/trousse-soliris.sh
#
# Le script n'affiche JAMAIS la valeur d'un secret. Il écrit les noms des
# variables trouvées, et rien d'autre. Personne — ni moi, ni un journal, ni
# une capture d'écran — ne voit tes clés passer.
#
set -uo pipefail

PROJET="$HOME/workspace"
DEST="$HOME/soliris-export"
ARCHIVE="$HOME/soliris-export.tar.gz"

echo "=== Trousse Soliris ==="
rm -rf "$DEST" "$ARCHIVE"
mkdir -p "$DEST"

# ─── 1. Le code ───────────────────────────────────────────────────────────────
# git archive ne prend que ce qui est suivi par git : pas de node_modules,
# pas de dist, pas de cache. C'est ce qui fait la différence entre 30 Mo et
# 2 Go.
echo "[1/4] Code…"
cd "$PROJET" || { echo "ERREUR : $PROJET introuvable"; exit 1; }
mkdir -p "$DEST/code"
if git archive --format=tar HEAD | tar -x -C "$DEST/code"; then
  echo "      $(find "$DEST/code" -type f | wc -l) fichiers"
else
  echo "      ERREUR : git archive a échoué"
fi

# ─── 2. La base de données ────────────────────────────────────────────────────
# Tes positions, tes ordres, tes réglages, ton historique. C'est la partie
# irremplaçable : le code se réécrit, ça non.
echo "[2/4] Base de données…"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "      IGNORÉ : DATABASE_URL absente de l'environnement"
elif ! command -v pg_dump >/dev/null 2>&1; then
  echo "      IGNORÉ : pg_dump n'est pas installé dans ce conteneur"
else
  if pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists \
       > "$DEST/base.sql" 2>"$DEST/base.erreurs.txt"; then
    echo "      $(wc -l < "$DEST/base.sql") lignes SQL"
    rm -f "$DEST/base.erreurs.txt"
  else
    echo "      ERREUR : voir base.erreurs.txt"
  fi
fi

# ─── 3. Les secrets ───────────────────────────────────────────────────────────
# Écrits directement depuis l'environnement dans un fichier .env, sans jamais
# passer par la sortie du terminal.
echo "[3/4] Secrets…"
node -e '
const fs = require("fs");
const dest = process.argv[1];

// Tout ce qui ressemble à un secret applicatif, moins le bruit de Replit.
const garder = (nom) =>
  /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|API|DSN|DATABASE_URL|VAPID|WEBHOOK|CLIENT_ID|CONSUMER)/i.test(nom)
  && !/^(REPL|REPLIT|npm_|NIX|PATH$|HOME$|LANG|TERM|PWD$|SHLVL|_$)/i.test(nom);

const noms = Object.keys(process.env).filter(garder).sort();
const lignes = noms.map((n) => `${n}=${process.env[n]}`);
fs.writeFileSync(dest + "/.env", lignes.join("\n") + "\n", { mode: 0o600 });

// On affiche les NOMS, jamais les valeurs.
console.log("      " + noms.length + " variables :");
for (const n of noms) console.log("        - " + n);
' "$DEST"

# ─── 4. Le mode d emploi + l archive ──────────────────────────────────────────
echo "[4/4] Archive…"
cat > "$DEST/LISEZ-MOI.md" <<'FIN'
# Trousse Soliris Market

Trois choses dans ce dossier, et elles n'ont pas la même valeur.

| Fichier | Ce que c'est | Remplaçable ? |
|---|---|---|
| `code/` | Tout le dépôt, sans `node_modules` | oui — il est aussi sur GitHub |
| `base.sql` | Tes positions, ordres, réglages, historique | **NON** |
| `.env` | Tes clés : SnapTrade, Kraken, Resend, base… | **NON** |

## Remonter le site sur ton PC

Il te faut **Node 20+**, **pnpm** et **PostgreSQL**.

```bash
# 1. Dépendances
cd code && pnpm install

# 2. Base de données
createdb soliris
psql soliris < ../base.sql

# 3. Secrets
cp ../.env .env
# puis, dans .env, remplace DATABASE_URL par :
#   postgresql://localhost:5432/soliris

# 4. Démarrer
pnpm --filter @workspace/api-server dev
```

## `.env` — à traiter comme un trousseau de clés

Ce fichier contient de quoi passer de vrais ordres sur tes comptes.

- Ne le mets **jamais** dans un dépôt Git. Le `.gitignore` du projet l'exclut
  déjà, mais vérifie avant tout `git add`.
- Ne le colle **jamais** dans une conversation, un courriel, un ticket.
- S'il fuit, révoque les clés côté fournisseur — ne te contente pas de le
  supprimer.

C'est déjà arrivé une fois avec une clé Resend. Une clé qui touche à de
l'argent, on ne lui laisse pas cette occasion.
FIN

cd "$HOME"
tar czf "$ARCHIVE" -C "$HOME" soliris-export
echo
echo "=== Terminé ==="
echo "Archive : $ARCHIVE"
echo "Taille  : $(du -h "$ARCHIVE" | cut -f1)"
echo
echo "Pour la récupérer : dans le panneau Files de Replit, remonte à la racine"
echo "(~), clic droit sur soliris-export.tar.gz, puis « Download »."
