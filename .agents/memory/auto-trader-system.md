---
name: Auto-Trader System
description: Système d'auto-trading et notifications intelligentes — architecture, fichiers clés, état d'avancement.
---

# Système Auto-Trader — État complet

## Fichiers créés/modifiés

### Backend (artifacts/api-server)
- `src/workers/autoTradeWorker.ts` — Worker 60s : SL/TP surveillance, coupe-circuit perte, analyse signaux, SMS Twilio
- `src/workers/dailySummaryWorker.ts` — Bilan SMS quotidien 16h35 ET via Twilio
- `src/routes/autoTrader.ts` — CRUD règles + logs + POST /run
- `src/routes/dailySummary.ts` — POST /api/daily-summary/run (test/debug)
- `src/routes/index.ts` — autoTraderRouter + dailySummaryRouter enregistrés
- `src/index.ts` — startAutoTradeWorker() + startDailySummaryWorker() au démarrage

### DB (lib/db)
- `src/schema/autoTrader.ts` — Tables `auto_trade_rules` + `auto_trade_logs` + colonnes position (openEntryPrice, openQuantity, openSince)
- `src/schema/settings.ts` — appSettingsTable + lastDailySummaryDate + maxDailyLossAmount
- `src/schema/index.ts` — exports

### Frontend (artifacts/wealthsimple-tracker)
- `src/pages/AutoTrader.tsx` — Page complète (règles + logs + formulaire)
- `src/App.tsx` — Route `/auto-trader` + lien nav "Auto-Trader" (icône Cpu)

## Architecture

### auto_trade_rules (table)
Colonnes clés: symbol, enabled, side_mode (buy/sell/both), min_score (0-100),
quantity, stop_loss_pct, take_profit_pct, max_trades_per_day, cooldown_minutes,
notify_on_signal, last_signal_score, last_signal_verdict, trades_today,
**openEntryPrice, openQuantity, openSince** (tracking position ouverte)

### auto_trade_logs (table)
Colonnes: rule_id, symbol, side, trigger_type (order/notification_only/stop_loss/take_profit),
signal_score, signal_verdict, price, quantity, order_id, notification_sent

### app_settings (table)
Colonnes ajoutées: lastDailySummaryDate (YYYY-MM-DD), maxDailyLossAmount (text/null)

### Worker logic (60s interval)
1. checkProtectiveExits() — surveille positions ouvertes, bypass cooldown/quota, déclenche SELL total si SL/TP atteint
2. checkDailyLossCircuitBreaker() — active kill-switch si perte > maxDailyLossAmount
3. processRule() par règle active : cooldown → quota → OHLC → indicateurs → submitOrder → tracking position → SMS → log

### Daily Summary Worker (5 min check, sends once at 16h35-16h45 ET)
- Vérifie fenêtre horaire ET + lastDailySummaryDate pour éviter doublons
- SMS contient: kill-switch, ordres du jour, déclenchements auto, positions ouvertes avec %PnL + distances SL/TP
- Route test: POST /api/daily-summary/run

## Ajouts "auto-trade max" (juillet 2026)
- Trailing stop : cols `trailing_stop_pct` + `high_water_mark` — HWM initialisé à l'entrée, mis à jour chaque cycle, effacé à la sortie complète. Trailing ne s'arme que si HWM > prix d'entrée.
- Sizing par risque : `sizing_mode` ("fixed"/"risk") + `risk_amount` — quantité = risque ÷ (prix × SL%). API refuse mode "risk" sans riskAmount + stopLossPct.
- Confirmation hebdo : `confirm_weekly` — signal 1wk même direction requis ; données insuffisantes (<55 barres) ou erreur ⇒ refus du trade (fail-closed).
- Backtest : `src/lib/backtest.ts` + POST /api/auto-trader/backtest (long-only, mode "sell" rejeté). Trailing évalué avec le HWM des barres précédentes (pas de lookahead intrabar) ; HWM mis à jour APRÈS les sorties du jour.
- **Règle critique** : checkProtectiveExits ne vide l'état de position QUE si la vente est confirmée (accepted/duplicate) — sinon la position réelle resterait non surveillée.
- Validation stricte des règles côté API (bornes sur tous les champs numériques) via validateRuleNumbers().
- UI : OpenPositionsPanel (P&L live via /api/quotes), backtest inline dans RuleForm, badges Trail/Risque/Confirm hebdo.
- Bugs préexistants corrigés : orders n'a pas de colonne price (→ fillPrice/expectedPrice) ni source (→ préfixe signalId "auto-") ; broker_connections n'a pas updatedAt (→ haltedAt).

## Points d'extension restants
- Filtrage par force de signal (minStrength "moyen"/"fort") — pattern validé dans alertes, à reprendre sur auto_trade_rules
- Email : emailClient.ts est un stub — SMS Twilio est le canal opérationnel
- UI: exposer maxDailyLossAmount dans /parametres + afficher positions ouvertes dans /auto-trader

**Why:** Système demandé explicitement par l'utilisateur pour automatiser le trading
basé sur les signaux techniques existants (RSI, MACD, SMA, Bollinger).

**Sources de signaux (juillet 2026)** : toute nouvelle source de signal (ex. copy trading) doit réutiliser `checkRuleEntryGuardrails` + `computeRuleQuantity` du worker — jamais réimplémenter quotas/cooldown/sizing, et fail closed sans cotation. Réclamation atomique des événements source (INSERT ... ON CONFLICT DO NOTHING) avant émission.
