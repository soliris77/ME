
## 🔴 PROTOCOLE OBLIGATOIRE — À LIRE AVANT TOUT TRAVAIL
- [current-task.md](current-task.md) — **LIRE EN PREMIER** : état exact de la tâche en cours (étapes ✅ FAIT / → EN COURS / ☐ À FAIRE)
- [checkpoint-protocol.md](checkpoint-protocol.md) — protocole pas-à-pas obligatoire : écrire chaque étape AVANT de l'exécuter, cocher après — garantit la reprise après coupure

## Connaissances techniques du projet
- [API server build-on-restart](api-server-build.md) — API server must rebuild on every restart; stale dist/index.mjs causes silent data failures.
- [Yahoo Finance batch queries](yahoo-finance-batch.md) — use array form of yahooFinance.quote() with skipValidation:true; 50 symbols/batch, 4 batches parallel gives ~1s vs 15s individually.
- [isUp null semantics](isup-null-semantics.md) — isUp() returns boolean|null; null means no data — suppress arrows/colors, don't default to "up".
- [Auth password persistence](auth-password-persistence.md) — password hash stored in app_settings.password_hash; DB beats env var; /setup route for first launch.
- [Session continuity](session-continuity.md) — write .agents/memory/in-progress.md for multi-step tasks; read it when user says "continue".
- [Workflow secret injection](workflow-secret-injection.md) — after adding or confirming Secrets, restart the API workflow and verify presence from startup logs before testing integrations.
- [Agent Task Continuity System](agent-task-continuity.md) — DB table agent_tasks + API /api/agent-tasks + page /agent-tasks; auto-writes in-progress.md on every save/pause.
- [Motion system frontend](motion-system.md) — variants partagés src/lib/motion.ts; reduced-motion via MotionConfig racine + useReducedMotion (pas automatique); easings `as const`.
- [Alertes en arrière-plan](background-alerts.md) — poll fiable = page (≥60 s survit au throttling) ; timers SW non fiables ; periodicsync = bonus ; navigateur fermé → Web Push.
- [getQuotes ne rejette jamais](quotes-fail-closed.md) — erreurs Yahoo avalées, liste partielle/vide renvoyée ; les calculs de risque doivent fail closed sur cotation manquante.
- [Confirmation des ventes protectrices](api-server-tests.md) — "accepted" de submitOrder peut cacher un ordre en erreur ; ne jamais effacer une position sans vérifier order.status.
- [Suggestion de stop-loss](stop-suggestion.md) — un « plus bas 20 jours » exige un historique quotidien dédié (range=1mo), jamais la plage visible du graphique (bougies hebdo/mensuelles en 6m/1a).
- [db:push silencieusement cassé](db-push-non-interactive.md) — drizzle-kit push exige un TTY ; au démarrage le schéma n'est PAS appliqué — faire le DDL via psql + rebuild tsc -b dans lib/db.
- [Typecheck racine fragile](root-typecheck.md) — `pnpm typecheck` exige tsconfig.json racine (références lib/*) ; s'il manque, tsc --build échoue partout — le restaurer, ne pas contourner.
- [Sémantique des statuts d'ordres](order-status-semantics.md) — en live, `submitted` ≠ exécuté ; les métriques de trades réels exigent `filled`+`fillPrice` (paper : `simulated`).
- [Anti-empilement des stops](duplicate-stop-guard.md) — un seul stop actif par symbole+compte ; même politique de correspondance serveur (duplicate_stop) et UI ; fail closed si compte inconnu.
- [Ordres stop de protection](stop-orders.md) — stop SELL strictement sous le prix live (validé serveur) ; orderType inconnu ⇒ 400, jamais de fallback market.
- [Répartition du portefeuille](portfolio-allocation-rules.md) — devise = Position.currency (pas la cotation) ; cash_equivalent exclu de l'investi ; FX manquant ⇒ exclusion + fxWarning, jamais 1:1.
- [Validation des exercices pratiques](practice-validation.md) — badge « Exercice fait » : critères serveur par slug de leçon + table practice_events pour les outils sans persistance ; garder les slugs alignés avec parcoursContent.ts.
- [Auto-Trader System](auto-trader-system.md) — tables auto_trade_rules + auto_trade_logs; worker 60s; routes /api/auto-trader/*; page /auto-trader; SMS Twilio sur signal.
- [Armement temporaire du live](live-trading-arm.md) — le mode live exige toujours un compte, des plafonds positifs et une expiration; paper reste l’état sûr par défaut.
