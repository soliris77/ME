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

## Points d'extension restants
- Filtrage par force de signal (minStrength "moyen"/"fort") — pattern validé dans alertes, à reprendre sur auto_trade_rules
- Email : emailClient.ts est un stub — SMS Twilio est le canal opérationnel
- UI: exposer maxDailyLossAmount dans /parametres + afficher positions ouvertes dans /auto-trader

**Why:** Système demandé explicitement par l'utilisateur pour automatiser le trading
basé sur les signaux techniques existants (RSI, MACD, SMA, Bollinger).
