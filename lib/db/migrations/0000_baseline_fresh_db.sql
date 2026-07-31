-- Schéma de base complet (baseline), généré depuis lib/db/src/schema via
-- drizzle-kit generate. Ne s'exécute que sur une base VIERGE (nouveau remix) :
-- sur une base existante (détectée via app_settings), il ne fait rien — le
-- schéma y a déjà été créé historiquement par drizzle-kit push.
-- Contexte : `drizzle-kit push` au démarrage était non fiable (prompts sans
-- TTY, erreurs avalées) ; le démarrage repose désormais uniquement sur les
-- migrations versionnées appliquées par apply-migrations.mjs.
DO $baseline$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    RETURN;
  END IF;

CREATE TABLE "watchlist_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "watchlist_lists_name_unique" UNIQUE("name")
);

CREATE TABLE "watchlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"list_name" text DEFAULT 'Général' NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"alert_type" text DEFAULT 'price' NOT NULL,
	"condition" text,
	"target_price" numeric(18, 6),
	"pattern_signal" text,
	"min_strength" text,
	"active" boolean DEFAULT true NOT NULL,
	"triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"notify_email" text,
	"notify_phone" text
);

CREATE TABLE "broker_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'snaptrade' NOT NULL,
	"snaptrade_user_id" text NOT NULL,
	"snaptrade_user_secret" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp,
	"accounts" jsonb DEFAULT '[]'::jsonb,
	"trading_halted" boolean DEFAULT false NOT NULL,
	"halted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"quantity" text NOT NULL,
	"order_type" text DEFAULT 'market' NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expected_price" text,
	"fill_price" text,
	"filled_quantity" text,
	"snaptrade_order_id" text,
	"broker_account_id" text,
	"error_message" text,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "rejected_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" text NOT NULL,
	"symbol" text NOT NULL,
	"reason" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"max_order_value" text NOT NULL,
	"max_portfolio_exposure" text NOT NULL,
	"large_order_friction_pct" text NOT NULL,
	"password_hash" text,
	"snaptrade_client_id" text,
	"snaptrade_consumer_key" text,
	"snaptrade_user_id" text,
	"snaptrade_user_secret" text,
	"twilio_account_sid" text,
	"twilio_auth_token" text,
	"twilio_from_number" text,
	"vapid_public_key" text,
	"vapid_private_key" text,
	"last_daily_summary_date" text,
	"max_daily_loss_amount" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"kill_switch_channel" text DEFAULT 'email' NOT NULL,
	"large_order_channel" text DEFAULT 'email' NOT NULL,
	"threshold_change_channel" text DEFAULT 'email' NOT NULL,
	"price_alert_channel" text DEFAULT 'email' NOT NULL,
	"pattern_alert_channel" text DEFAULT 'email' NOT NULL,
	"signal_alert_channel" text DEFAULT 'email' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "learn_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"quiz_score" integer,
	"quiz_total" integer,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "learn_progress_section_id_unique" UNIQUE("section_id")
);

CREATE TABLE "chart_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"candle_date" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "copied_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"followed_trader_id" serial NOT NULL,
	"external_trade_id" text NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"original_amount" numeric,
	"copied_amount" numeric,
	"status" text DEFAULT 'pending' NOT NULL,
	"opened_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "followed_traders" (
	"id" serial PRIMARY KEY NOT NULL,
	"mt_connection_id" serial NOT NULL,
	"external_strategy_id" text NOT NULL,
	"trader_display_name" text,
	"auto_execute" boolean DEFAULT false NOT NULL,
	"max_amount_per_trade" numeric,
	"max_percent_of_capital" numeric,
	"stop_loss_global_percent" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "mt_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text DEFAULT 'metatrader' NOT NULL,
	"encrypted_login" text NOT NULL,
	"encrypted_investor_password" text NOT NULL,
	"broker_server" text NOT NULL,
	"meta_api_account_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_sync_at" timestamp
);

CREATE TABLE "spotify_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"spotify_user_id" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"email" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spotify_connections_spotify_user_id_unique" UNIQUE("spotify_user_id")
);

CREATE TABLE "agent_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"steps_completed" text DEFAULT '[]' NOT NULL,
	"next_steps" text DEFAULT '[]' NOT NULL,
	"checkpoint_notes" text DEFAULT '' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"paused_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "auto_trade_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"trigger_type" text NOT NULL,
	"signal_score" integer,
	"signal_verdict" text,
	"price" numeric(18, 6),
	"quantity" numeric(18, 8),
	"order_id" integer,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"notes" text,
	"source" text,
	"followed_trader_id" integer,
	"external_trade_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "auto_trade_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"side_mode" text DEFAULT 'both' NOT NULL,
	"min_score" integer DEFAULT 60 NOT NULL,
	"quantity" numeric(18, 8) DEFAULT '1' NOT NULL,
	"account_id" text,
	"stop_loss_pct" numeric(6, 2),
	"take_profit_pct" numeric(6, 2),
	"trailing_stop_pct" numeric(6, 2),
	"high_water_mark" numeric(18, 6),
	"sizing_mode" text DEFAULT 'fixed' NOT NULL,
	"risk_amount" numeric(18, 2),
	"confirm_weekly" boolean DEFAULT false NOT NULL,
	"max_trades_per_day" integer DEFAULT 3 NOT NULL,
	"notify_on_signal" boolean DEFAULT true NOT NULL,
	"cooldown_minutes" integer DEFAULT 240 NOT NULL,
	"trades_today" integer DEFAULT 0 NOT NULL,
	"trades_today_reset_at" timestamp,
	"last_triggered_at" timestamp,
	"last_signal_score" integer,
	"last_signal_verdict" text,
	"open_entry_price" numeric(18, 6),
	"open_quantity" numeric(18, 8),
	"open_since" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "auto_trade_copy_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"followed_trader_id" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);

CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" integer,
	"symbol" text NOT NULL,
	"name" text,
	"alert_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"channels" text DEFAULT 'push' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);

CREATE TABLE "investment_theses" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"reason" text NOT NULL,
	"target_price" numeric,
	"invalidation_price" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investment_theses_symbol_unique" UNIQUE("symbol")
);

ALTER TABLE "copied_trades" ADD CONSTRAINT "copied_trades_followed_trader_id_followed_traders_id_fk" FOREIGN KEY ("followed_trader_id") REFERENCES "public"."followed_traders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "followed_traders" ADD CONSTRAINT "followed_traders_mt_connection_id_mt_connections_id_fk" FOREIGN KEY ("mt_connection_id") REFERENCES "public"."mt_connections"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "auto_trade_copy_bindings" ADD CONSTRAINT "auto_trade_copy_bindings_rule_id_auto_trade_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."auto_trade_rules"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "auto_trade_copy_bindings" ADD CONSTRAINT "auto_trade_copy_bindings_followed_trader_id_followed_traders_id_fk" FOREIGN KEY ("followed_trader_id") REFERENCES "public"."followed_traders"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "orders_signal_id_idx" ON "orders" USING btree ("signal_id");
CREATE UNIQUE INDEX "copied_trades_trader_external_unique" ON "copied_trades" USING btree ("followed_trader_id","external_trade_id");
CREATE UNIQUE INDEX "followed_traders_strategy_idx" ON "followed_traders" USING btree ("external_strategy_id");
CREATE UNIQUE INDEX "auto_trade_copy_bindings_rule_trader_unique" ON "auto_trade_copy_bindings" USING btree ("rule_id","followed_trader_id");
END
$baseline$;
