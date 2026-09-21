/**
 * /api/perps — pilotage des contrats perpétuels à levier (lot 10).
 *
 * Protégé par requireAuth et requirePremium (monté dans routes/index.ts).
 *
 * Deux principes gouvernent ce fichier :
 *
 *   1. Les deux serrures ne s'ouvrent jamais par la même requête. `enabled`
 *      et `mode` ont chacun leur route, et armer exige `confirm: true` EN
 *      PLUS des conditions mesurées.
 *   2. Désarmer ne se refuse jamais. Aucune condition, aucune validation qui
 *      puisse échouer : si quelqu'un veut arrêter, ça s'arrête.
 *
 * Aucune route ne lit ni n'écrit de clé privée. L'état renvoie au plus
 * l'adresse publique du compte et un booléen de présence.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, perpsSettingsTable } from "@workspace/db";
import {
  DEFAULT_VENUE,
  armingStatus,
  asVenueId,
  buildContext,
  compareVenues,
  judge,
  loadConfig,
  loadDayState,
  recentDecisions,
} from "../lib/perpsService";
import { venueAdapter } from "../lib/perpsVenueRegistry";
import { HyperliquidVenue } from "../lib/hyperliquidVenue";
import { logger } from "../lib/logger";

const router = Router();

/**
 * La plateforme visée par la requête.
 *
 * Chaque route la lit explicitement : un réglage GMX ne doit jamais pouvoir
 * atterrir sur la ligne Hyperliquid parce qu'un paramètre manquait.
 */
function venueOf(source: unknown): string {
  if (source === null || typeof source !== "object") return DEFAULT_VENUE;
  const value = (source as Record<string, unknown>).venue;
  return typeof value === "string" && value !== "" ? value : DEFAULT_VENUE;
}

/** Champs modifiables, avec leurs bornes. Rien d'autre n'est accepté. */
const SETTING_FIELDS: Record<
  string,
  { column: string; min: number; max: number; integer?: boolean }
> = {
  riskFraction: { column: "risk_fraction", min: 0.0001, max: 0.05 },
  maxLeverage: { column: "max_leverage", min: 1, max: 20 },
  maxTotalLeverage: { column: "max_total_leverage", min: 1, max: 20 },
  maxOpenPositions: { column: "max_open_positions", min: 1, max: 20, integer: true },
  maxTradesPerDay: { column: "max_trades_per_day", min: 1, max: 200, integer: true },
  maxDailyCostFraction: { column: "max_daily_cost_fraction", min: 0.0001, max: 0.5 },
  dailyLossLimitFraction: { column: "daily_loss_limit_fraction", min: 0.0001, max: 0.5 },
  liquidationBuffer: { column: "liquidation_buffer", min: 1, max: 10 },
  minSampleSize: { column: "min_sample_size", min: 1, max: 10000, integer: true },
  minShadowDecisions: { column: "min_shadow_decisions", min: 1, max: 10000, integer: true },
  assumedSlippagePerSide: { column: "assumed_slippage_per_side", min: 0, max: 0.05 },
  assumedFundingPerTrade: { column: "assumed_funding_per_trade", min: 0, max: 0.5 },
  assumedFixedCostUsd: { column: "assumed_fixed_cost_usd", min: 0, max: 100 },
  shadowEquityUsd: { column: "shadow_equity_usd", min: 1, max: 1000000 },
};

router.get("/perps/state", async (req, res) => {
  try {
    const venue = asVenueId(venueOf(req.query));
    const [config, day, arming] = await Promise.all([
      loadConfig(venue),
      loadDayState(venue),
      armingStatus(false, venue),
    ]);
    res.json({ config, day, arming });
  } catch (error) {
    logger.error({ err: error }, "perps: lecture de l'etat impossible");
    res.status(500).json({ error: "Lecture de l'état impossible" });
  }
});

/**
 * Solde Hyperliquid en lecture seule.
 *
 * Cette route ne passe jamais par `placeOrder`, `arm` ou `handleCandidate`.
 * Elle ne renvoie que les chiffres de compte et l'adresse publique.
 */
router.get("/perps/balance", async (req, res) => {
  try {
    const venue = asVenueId(venueOf(req.query));
    if (venue !== "hyperliquid") {
      res.status(400).json({ error: "Le solde temps réel est disponible pour Hyperliquid uniquement." });
      return;
    }

    const adapter = venueAdapter(venue);
    if (!adapter.credentialsPresent()) {
      res.status(503).json({ error: "Les identifiants Hyperliquid ne sont pas configurés." });
      return;
    }

    const account = adapter.create();
    if (!(account instanceof HyperliquidVenue)) {
      res.status(503).json({ error: "Le compte Hyperliquid est indisponible." });
      return;
    }

    const [balances, state] = await Promise.all([
      account.getBalanceSnapshot(),
      account.getAccountState(),
    ]);
    if (
      !Number.isFinite(balances.perpsTotalUsd) ||
      balances.perpsTotalUsd < 0 ||
      !Number.isFinite(balances.spotTotalUsd) ||
      balances.spotTotalUsd < 0 ||
      !Number.isFinite(balances.perpsAvailableUsd) ||
      balances.perpsAvailableUsd < 0
    ) {
      throw new Error("Solde Hyperliquid invalide");
    }

    res.json({
      venue,
      usdcBalance: balances.perpsTotalUsd + balances.spotTotalUsd,
      perpsUsdc: balances.perpsTotalUsd,
      spotUsdc: balances.spotTotalUsd,
      availableMarginUsd: balances.perpsAvailableUsd,
      spotAvailableUsd: balances.spotAvailableUsd,
      openPositions: state.positions.length,
      walletAddress: adapter.publicAddress(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "perps: lecture du solde Hyperliquid impossible");
    res.status(502).json({ error: "Impossible de lire le solde Hyperliquid." });
  }
});

/**
 * Les deux plateformes côte à côte, sur les mêmes réglages.
 *
 * C'est la route qui répond « laquelle vaut le coup ? » par des chiffres
 * plutôt que par une opinion — et la réponse dépend de la taille, donc le
 * capital est un paramètre.
 */
router.get("/perps/venues", async (req, res) => {
  try {
    const raw = Number(req.query.equityUsd);
    const equityUsd = Number.isFinite(raw) && raw > 0 ? raw : undefined;
    res.json({ venues: await compareVenues(equityUsd) });
  } catch (error) {
    logger.error({ err: error }, "perps: comparaison des plateformes impossible");
    res.status(500).json({ error: "Comparaison impossible" });
  }
});

/**
 * Mesure le frais fixe réel de la plateforme.
 *
 * Ne signe rien et n'envoie rien : GMX permet de préparer un ordre pour en
 * connaître le gaz, puis de le jeter. C'est ce qui remplace la devinette du
 * barème par un chiffre observé.
 */
router.post("/perps/measure-fixed-cost", async (req, res) => {
  try {
    const venue = asVenueId(venueOf(req.body));
    const adapter = venueAdapter(venue);
    const measured = await adapter.measureFixedCostUsd();
    if (measured === null) {
      res.json({
        venue,
        measured: null,
        note: `${adapter.label} ne facture pas de frais fixe, ou aucun compte n'est branché.`,
      });
      return;
    }
    res.json({ venue, measured });
  } catch (error) {
    logger.error({ err: error }, "perps: mesure du frais fixe impossible");
    res.status(500).json({ error: "Mesure impossible" });
  }
});

router.get("/perps/decisions", async (req, res) => {
  try {
    const raw = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(raw) ? raw : 50;
    const venue = typeof req.query.venue === "string" ? req.query.venue : undefined;
    res.json({ decisions: await recentDecisions(limit, venue) });
  } catch (error) {
    logger.error({ err: error }, "perps: lecture des decisions impossible");
    res.status(500).json({ error: "Lecture des décisions impossible" });
  }
});

/**
 * Modifie les plafonds. Volontairement incapable de toucher `enabled` ou
 * `mode` : une route qui change des chiffres ne doit pas pouvoir armer.
 */
router.put("/perps/settings", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Record<string, number> = {};
  const rejected: string[] = [];

  let venue: string;
  try {
    venue = asVenueId(venueOf(body));
  } catch (error) {
    res.status(400).json({ error: String(error instanceof Error ? error.message : error) });
    return;
  }

  for (const [key, value] of Object.entries(body)) {
    // `venue` dit SUR QUELLE ligne écrire, ce n'est pas une valeur à écrire.
    if (key === "venue") continue;
    const field = SETTING_FIELDS[key];
    if (!field) {
      rejected.push(`${key} : champ inconnu`);
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < field.min || n > field.max) {
      rejected.push(`${key} : attendu entre ${field.min} et ${field.max}`);
      continue;
    }
    if (field.integer === true && !Number.isInteger(n)) {
      rejected.push(`${key} : nombre entier attendu`);
      continue;
    }
    updates[key] = n;
  }

  if (rejected.length > 0) {
    res.status(400).json({ error: "Réglages invalides", rejected });
    return;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Aucun réglage fourni" });
    return;
  }

  // Les colonnes numeric de drizzle attendent des chaînes ; les integer non.
  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, n] of Object.entries(updates)) {
    values[key] = SETTING_FIELDS[key]?.integer === true ? n : String(n);
  }

  try {
    await db
      .update(perpsSettingsTable)
      .set(values)
      .where(eq(perpsSettingsTable.venue, venue));
    res.json({ config: await loadConfig(venue) });
  } catch (error) {
    logger.error({ err: error }, "perps: ecriture des reglages impossible");
    res.status(500).json({ error: "Écriture des réglages impossible" });
  }
});

/** Première serrure. N'arme rien : le mode reste ce qu'il était. */
router.post("/perps/enable", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.enabled !== "boolean") {
    res.status(400).json({ error: "Champ `enabled` booléen attendu" });
    return;
  }

  try {
    const venue = asVenueId(venueOf(body));
    await db
      .update(perpsSettingsTable)
      .set({ enabled: body.enabled, updatedAt: new Date() })
      .where(eq(perpsSettingsTable.venue, venue));
    res.json({ config: await loadConfig(venue) });
  } catch (error) {
    logger.error({ err: error }, "perps: bascule de l'interrupteur impossible");
    res.status(500).json({ error: "Bascule impossible" });
  }
});

/**
 * Deuxième serrure. Exige `confirm: true` et toutes les conditions de
 * canArm : identifiants présents, assez de décisions fantômes, et un bord
 * mesuré qui dépasse le coût. Un refus renvoie la liste complète des
 * obstacles, pour qu'on sache quoi corriger plutôt que quoi contourner.
 */
router.post("/perps/arm", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.confirm !== true) {
    res.status(400).json({ error: "Armement refusé : `confirm: true` est obligatoire" });
    return;
  }

  try {
    const venue = asVenueId(venueOf(body));
    const status = await armingStatus(true, venue);
    if (!status.ok) {
      res.status(409).json({ error: "Armement refusé", blockers: status.blockers, status });
      return;
    }

    await db
      .update(perpsSettingsTable)
      .set({ mode: "armed", armedAt: new Date(), updatedAt: new Date() })
      .where(eq(perpsSettingsTable.venue, venue));
    logger.warn({ venue }, "perps: passage en mode ARME");
    res.json({ config: await loadConfig(venue), status });
  } catch (error) {
    logger.error({ err: error }, "perps: armement impossible");
    res.status(500).json({ error: "Armement impossible" });
  }
});

/** Désarmement. Aucune condition : ça doit toujours pouvoir s'arrêter. */
router.post("/perps/disarm", async (req, res) => {
  try {
    const venue = asVenueId(venueOf(req.body));
    await db
      .update(perpsSettingsTable)
      .set({ mode: "shadow", disarmedAt: new Date(), updatedAt: new Date() })
      .where(eq(perpsSettingsTable.venue, venue));
    logger.warn({ venue }, "perps: retour en mode fantome");
    res.json({ config: await loadConfig(venue) });
  } catch (error) {
    logger.error({ err: error }, "perps: désarmement impossible");
    res.status(500).json({ error: "Désarmement impossible" });
  }
});

/**
 * Essai à blanc : le verdict complet sur une occasion hypothétique, sans
 * rien écrire et sans rien envoyer. Sert à voir l'effet d'un réglage avant
 * de le garder.
 */
router.post("/perps/simulate", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const side = body.side === "short" ? "short" : "long";
  const entryPrice = Number(body.entryPrice);
  const stopPrice = Number(body.stopPrice);
  const measuredGrossEdge = Number(body.measuredGrossEdge);
  const sampleSize = Number(body.sampleSize);

  if (
    symbol === "" ||
    symbol.length > 20 ||
    !(entryPrice > 0) ||
    !(stopPrice > 0) ||
    !Number.isFinite(measuredGrossEdge) ||
    !Number.isInteger(sampleSize) ||
    sampleSize < 0
  ) {
    res.status(400).json({ error: "Occasion invalide" });
    return;
  }

  try {
    const context = await buildContext(symbol);
    const verdict = judge(context, {
      symbol,
      side,
      entryPrice,
      stopPrice,
      measuredGrossEdge,
      sampleSize,
    });
    res.json({
      verdict,
      equityUsd: context.account.equityUsd,
      market: context.market,
      venueConnected: context.venue !== null,
    });
  } catch (error) {
    logger.error({ err: error }, "perps: simulation impossible");
    res.status(500).json({ error: "Simulation impossible" });
  }
});

export default router;
