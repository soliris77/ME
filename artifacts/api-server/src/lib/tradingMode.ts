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
