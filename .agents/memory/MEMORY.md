
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
- [Confirmation des ventes protectrices](api-server-tests.md) — "accepted" de submitOrder peut cacher un ordre en erreur ; ne jamais effacer une position sans vérifier order.status.
- [Suggestion de stop-loss](stop-suggestion.md) — un « plus bas 20 jours » exige un historique quotidien dédié (range=1mo), jamais la plage visible du graphique (bougies hebdo/mensuelles en 6m/1a).
- [Auto-Trader System](auto-trader-system.md) — tables auto_trade_rules + auto_trade_logs; worker 60s; routes /api/auto-trader/*; page /auto-trader; SMS Twilio sur signal.
