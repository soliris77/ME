---
name: Auto-Trader System
description: Système d'auto-trading et notifications intelligentes — architecture, fichiers clés, état d'avancement.
---

# Système Auto-Trader — État complet

## Fichiers créés/modifiés

### Backend (artifacts/api-server)
- `src/workers/autoTradeWorker.ts` — Worker 60s : analyse signaux, soumet ordres, notifie par SMS
- `src/routes/autoTrader.ts` — CRUD règles + logs d'exécution
- `src/routes/index.ts` — autoTraderRouter enregistré
- `src/index.ts` — startAutoTradeWorker() appelé au démarrage

### DB (lib/db)
- `src/schema/autoTrader.ts` — Tables `auto_trade_rules` + `auto_trade_logs`
- `src/schema/index.ts` — export ajouté

### Frontend (artifacts/wealthsimple-tracker)
- `src/pages/AutoTrader.tsx` — Page complète (règles + logs + formulaire)
- `src/App.tsx` — Route `/auto-trader` + lien nav "Auto-Trader" (icône Cpu)

## Architecture

### auto_trade_rules (table)
Colonnes clés: symbol, enabled, side_mode (buy/sell/both), min_score (0-100),
quantity, stop_loss_pct, take_profit_pct, max_trades_per_day, cooldown_minutes,
notify_on_signal, last_signal_score, last_signal_verdict, trades_today

### auto_trade_logs (table)
Colonnes: rule_id, symbol, side, trigger_type (order/notification_only/stop_loss/take_profit),
signal_score, signal_verdict, price, quantity, order_id, notification_sent

### Worker logic (60s interval)
1. Charge les règles actives
2. Vérifie cooldown + quota journalier par règle
3. Fetch OHLC 90j via Yahoo Finance
4. computeIndicators() + analyzeTradingSignals()
5. Si abs(score) >= min_score AND direction match → submitOrder() via orderEngine
6. Notifie par SMS via Twilio (notifyOnSignal)
7. Logue en auto_trade_logs

## Points d'extension restants
- Stop-loss/take-profit : logique côté serveur à implémenter (surveiller positions ouvertes)
  actuellement documenté dans les règles mais non exécuté automatiquement
- Email : emailClient.ts est un stub — connexion SMTP à configurer si besoin
- Filtrage par force de signal (FORT ACHAT vs ACHAT) — actuellement basé sur score brut

**Why:** Système demandé explicitement par l'utilisateur pour automatiser le trading
basé sur les signaux techniques existants (RSI, MACD, SMA, Bollinger).
