# Comment appliquer ces changements dans ton Repl

Ces fichiers remplacent/ajoutent des fichiers dans ton projet existant. Copie-les
par-dessus (même chemin relatif) dans ton Repl, puis :

1. **Migration DB** (nouvelle colonne `notify_email` sur `alerts`) :
   ```
   pnpm --filter @workspace/db run push
   ```

2. **Régénérer les types/hooks frontend** (le champ `notifyEmail` a été ajouté à
   l'OpenAPI spec) :
   ```
   pnpm --filter @workspace/api-spec run codegen
   ```

3. **Configurer l'envoi d'email** (optionnel mais recommandé — sans ça, les
   alertes se déclenchent quand même dans la DB mais aucun email ne part) :
   - Crée un compte sur https://resend.com (gratuit jusqu'à 3000 emails/mois),
     vérifie un domaine ou utilise leur domaine de test.
   - Ajoute ces secrets dans l'onglet Secrets de Replit :
     - `RESEND_API_KEY`
     - `RESEND_FROM` (ex: `WS Marchés <alerts@tondomaine.com>`)
     - `ALERT_NOTIFY_EMAIL` (ton adresse email par défaut)

4. **Vérifier le typecheck** avant de redéployer :
   ```
   pnpm run typecheck
   ```

## Ce qui a changé

- `artifacts/api-server/src/lib/yahoo.ts` (nouveau) — client Yahoo Finance
  partagé, évite la duplication entre `quotes.ts` et `market.ts`.
- `artifacts/api-server/src/lib/emailClient.ts` (nouveau) — envoi d'email via
  l'API Resend, no-op silencieux si pas configuré.
- `artifacts/api-server/src/workers/alertWorker.ts` (nouveau) — le worker
  lui-même : poll toutes les alertes actives, compare aux prix en direct,
  marque `active=false`/`triggeredAt` et envoie l'email.
- `artifacts/api-server/src/index.ts` — démarre le worker au lancement du
  serveur (`ALERT_CHECK_INTERVAL_MS`, défaut 90s).
- `artifacts/api-server/src/routes/{quotes,market,alerts}.ts` — refactorisés
  pour utiliser le client Yahoo partagé ; `alerts.ts` accepte/retourne
  `notifyEmail`.
- `lib/db/src/schema/alerts.ts` — nouvelle colonne `notifyEmail` (nullable).
- `lib/api-spec/openapi.yaml` — `notifyEmail` ajouté aux schémas `Alert`/`AlertInput`.
- `artifacts/wealthsimple-tracker/src/pages/Alerts.tsx` — champ email optionnel
  dans le formulaire de création d'alerte.
- `replit.md` — nouvelles variables d'env et gotchas documentés.

## À savoir

- Le worker tourne **dans le même process** que l'API server. Si tu scales un
  jour à plusieurs instances, il faudra le sortir en job planifié séparé
  (sinon chaque instance va vérifier/notifier en double).
- L'intervalle par défaut (90s) est un compromis raisonnable pour ne pas
  spammer l'API Yahoo Finance non-officielle. Descend-le seulement si tu vois
  que ça tient dans la durée sans erreurs 429.
