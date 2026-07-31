# Soliris Market

## Aperçu

Terminal de suivi des marchés et de trading (paper/live) connecté à Wealthsimple via SnapTrade. Monorepo pnpm avec trois artefacts :

- `artifacts/api-server` — backend Express (TypeScript, esbuild, Drizzle ORM/Postgres). Expose `/api/*` : cotations, watchlist, alertes, journal de marché, courtier (SnapTrade), authentification.
- `artifacts/wealthsimple-tracker` — frontend React + Vite + wouter + TanStack Query. Design "Obsidian Luxe" (fond sombre, accents dorés #D4A72C, IBM Plex Mono pour les chiffres).
- `artifacts/mockup-sandbox` — bac à sable de prototypage de composants (canvas).

Base de données Postgres partagée via `@workspace/db` (Drizzle). Garde-fous de risque (heures de marché, valeur max par ordre, exposition portefeuille, kill-switch) dans `api-server/src/lib/risk.ts` et `orderEngine.ts` — tout ordre, manuel ou automatisé, passe par `submitOrder()`.

## Authentification

Application mono-utilisateur protégée par un seul mot de passe (secret `AUTH_PASSWORD`, jamais stocké en clair — haché en mémoire avec bcrypt au démarrage). Session cookie httpOnly/secure stockée dans Postgres via `connect-pg-simple`, signée avec `SESSION_SECRET`. Middleware `requireAuth` protège toutes les routes API sauf `/api/health` et `/api/auth/*`. Le frontend redirige vers `/login` (avec `?next=`) tant que la session n'est pas confirmée par `GET /api/auth/me`.

## User preferences

- Travailler la liste de fonctionnalités par palier de priorité (CRITIQUE → IMPORTANT → AGRÉABLE À AVOIR) : montrer le code d'un palier et attendre confirmation avant de passer au suivant, plutôt que tout construire d'un coup.

- Préférence : solutions gratuites uniquement, pas d'API ou de services payants à long terme.
