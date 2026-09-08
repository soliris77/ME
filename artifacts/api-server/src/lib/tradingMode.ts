/**
 * tradingMode — état du mode de trading (paper / live), persisté en DB.
 *
 * - Au démarrage : lit app_settings.trading_mode depuis la DB (ou env TRADING_MODE).
 * - setTradingMode() : met à jour la mémoire + la DB.
 * - getTradingMode() : synchrone — utilise la valeur en mémoire.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger";

type Mode = "paper" | "live";
export const LIVE_ARM_CONFIRMATION = "ARM LIVE TRADING";
export const MIN_LIVE_ARM_DURATION_MINUTES = 1;
export const MAX_LIVE_ARM_DURATION_MINUTES = 480;

export interface LiveArm {
  accountId: string;
  maxOrderValue: number;
  dailyLossCap: number;
  expiresAt: Date;
  armedAt: Date;
}

// Valeur en mémoire — initialisée par initTradingMode() au démarrage.
let _mode: Mode = "paper";

/** Doit être appelé une seule fois au démarrage du serveur. */
export async function initTradingMode(): Promise<void> {
  try {
    // 1. Lire depuis DB
    const { rows } = await pool.query<{ trading_mode: string }>(
      "SELECT trading_mode FROM app_settings LIMIT 1"
    );
    if (rows.length > 0) {
      _mode = rows[0].trading_mode === "live" ? "live" : "paper";
      logger.info({ mode: _mode }, "tradingMode: chargé depuis la DB");
      return;
    }

    // 2. Pas de ligne — utiliser TRADING_MODE env ou 'paper' par défaut
    const envMode = (process.env.TRADING_MODE ?? "paper").toLowerCase();
    _mode = envMode === "live" ? "live" : "paper";
    logger.info({ mode: _mode }, "tradingMode: pas de ligne DB, utilise l'env");
  } catch (err) {
    logger.warn({ err }, "tradingMode: erreur de lecture DB, mode paper par défaut");
    _mode = "paper";
  }
}

/** Synchrone — retourne la valeur en mémoire. */
export function getTradingMode(): Mode {
  return _mode;
}

export function isLiveMode(): boolean {
  return _mode === "live";
}

/** Persiste le nouveau mode en DB et met à jour la mémoire. */
export async function setTradingMode(mode: Mode): Promise<void> {
  await pool.query(
    `UPDATE app_settings SET trading_mode = $1, updated_at = NOW()`,
    [mode]
  );
  _mode = mode;
  logger.info({ mode }, "tradingMode: mode mis à jour");
}

/** Reads the arm from storage on every live submission; it must never rely on
 * process memory because expiry and account scope are safety boundaries. */
export async function getLiveArm(): Promise<LiveArm | null> {
  const { rows } = await pool.query<{
    live_arm_account_id: string | null;
    live_arm_max_order_value: string | null;
    live_arm_daily_loss_cap: string | null;
    live_arm_expires_at: Date | null;
    live_arm_armed_at: Date | null;
  }>(`SELECT live_arm_account_id, live_arm_max_order_value, live_arm_daily_loss_cap,
       live_arm_expires_at, live_arm_armed_at FROM app_settings LIMIT 1`);
  const arm = rows[0];
  if (!arm?.live_arm_account_id || !arm.live_arm_expires_at || !arm.live_arm_armed_at) return null;
  const maxOrderValue = Number(arm.live_arm_max_order_value);
  const dailyLossCap = Number(arm.live_arm_daily_loss_cap);
  if (!Number.isFinite(maxOrderValue) || maxOrderValue <= 0 || !Number.isFinite(dailyLossCap) || dailyLossCap <= 0) return null;
  return { accountId: arm.live_arm_account_id, maxOrderValue, dailyLossCap, expiresAt: new Date(arm.live_arm_expires_at), armedAt: new Date(arm.live_arm_armed_at) };
}

export async function armLiveTrading(arm: LiveArm): Promise<void> {
  await pool.query(
    `UPDATE app_settings SET trading_mode = 'live', live_arm_account_id = $1,
       live_arm_max_order_value = $2, live_arm_daily_loss_cap = $3,
       live_arm_expires_at = $4, live_arm_armed_at = $5, updated_at = NOW()`,
    [arm.accountId, String(arm.maxOrderValue), String(arm.dailyLossCap), arm.expiresAt, arm.armedAt],
  );
  _mode = "live";
}

/** Paper mode clears every arm field so stale authority cannot be reused. */
export async function disarmLiveTrading(): Promise<void> {
  await pool.query(
    `UPDATE app_settings SET trading_mode = 'paper', live_arm_account_id = NULL,
       live_arm_max_order_value = NULL, live_arm_daily_loss_cap = NULL,
       live_arm_expires_at = NULL, live_arm_armed_at = NULL, updated_at = NOW()`,
  );
  _mode = "paper";
}
