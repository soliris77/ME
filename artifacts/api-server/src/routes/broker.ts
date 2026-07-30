/**
 * /api/broker/* — SnapTrade broker integration routes
 *
 * Setup flow (one-time):
 *   POST /api/broker/setup  → register snaptrade user + save to DB
 *   GET  /api/broker/connect-url  → Connection Portal URL (open in browser)
 *   GET  /api/broker/status       → connection & sync status
 *   POST /api/broker/sync         → refresh accounts/positions from SnapTrade
 *   GET  /api/broker/accounts     → list brokerage accounts
 *   GET  /api/broker/positions/:accountId  → positions for one account
 *   GET  /api/broker/balances/:accountId   → balances for one account
 */
import { Router } from "express";
import { db, brokerConnectionsTable, ordersTable, appSettingsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
// Note: `and` / `gte` / `ordersTable` no longer needed here — idempotence
// and all order logic now live entirely in orderEngine.submitOrder().
import {
  registerSnaptradeUser,
  getConnectionPortalUrl,
  listAccounts,
  listPositions,
  listBalances,
  getSnaptradeClientAsync,
  resolveCredentials,
  invalidateSnaptradeClient,
} from "../lib/snaptrade";
import { getTradingMode, setTradingMode } from "../lib/tradingMode";
import { submitOrder, OrderValidationError } from "../lib/orderEngine";
import { getRiskSettings } from "../lib/settings";
import { logAudit } from "../lib/audit";
import { notifyKillSwitchActivated } from "../lib/notifications";
import { logger } from "../lib/logger";
const router = Router();

// ─── Helper — retrieve the single broker connection row ───────────────────────
async function getConnection() {
  const rows = await db
    .select()
    .from(brokerConnectionsTable)
    .orderBy(desc(brokerConnectionsTable.id))
    .limit(1);
  return rows[0] ?? null;
}

// ─── POST /api/broker/credentials ────────────────────────────────────────────
// Sauvegarde les 4 clés SnapTrade personnelles directement en base.
// Toutes les 4 se trouvent dans ton tableau de bord app.snaptrade.com → Account Settings.
router.post("/broker/credentials", async (req, res) => {
  try {
    const { clientId, consumerKey, userId, userSecret } = req.body as {
      clientId?: string;
      consumerKey?: string;
      userId?: string;
      userSecret?: string;
    };

    if (!clientId || !consumerKey || !userId || !userSecret) {
      return res.status(400).json({ error: "Les 4 champs sont requis : Client ID, Consumer Key, User ID et User Secret." });
    }

    const rows = await db.select().from(appSettingsTable).limit(1);
    if (rows.length === 0) {
      return res.status(503).json({ error: "Serveur pas encore initialisé. Réessaie dans quelques secondes." });
    }
    const row = rows[0];
    await db
      .update(appSettingsTable)
      .set({ snaptradeClientId: clientId, snaptradeConsumerKey: consumerKey, snaptradeUserId: userId, snaptradeUserSecret: userSecret })
      .where(eq(appSettingsTable.id, row.id));

    invalidateSnaptradeClient();

    await logAudit("broker.credentials", "Clés SnapTrade mises à jour via l'interface (stockées en base).");
    logger.info("broker: 4 clés SnapTrade mises à jour en base");
    return res.json({ ok: true, message: "Clés sauvegardées. Elles survivront aux remixes." });
  } catch (err) {
    logger.error({ err }, "broker: save credentials failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/credentials ─────────────────────────────────────────────
// Retourne les credentials masqués (pour pré-remplir le formulaire côté UI).
router.get("/broker/credentials", async (_req, res) => {
  try {
    const creds = await resolveCredentials();
    // On masque les valeurs sensibles mais indique leur présence
    const mask = (v: string | null) => v ? v.substring(0, 4) + "•••••••••••••" : null;
    return res.json({
      clientId:    creds.clientId    ? mask(creds.clientId)    : null,
      consumerKey: creds.consumerKey ? mask(creds.consumerKey) : null,
      userId:      creds.userId      ? mask(creds.userId)      : null,
      userSecret:  creds.userSecret  ? mask(creds.userSecret)  : null,
      hasAll: !!(creds.clientId && creds.consumerKey && creds.userId && creds.userSecret),
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/trading-mode ─────────────────────────────────────────────
router.get("/broker/trading-mode", async (_req, res) => {
  const mode = getTradingMode();
  const creds = await resolveCredentials();
  const hasCredentials = !!(creds.clientId && creds.consumerKey && creds.userId && creds.userSecret);
  return res.json({ mode, hasCredentials });
});

// ─── POST /api/broker/trading-mode ────────────────────────────────────────────
// Bascule entre paper et live. Requiert confirmation côté client (window.confirm).
router.post("/broker/trading-mode", async (req, res) => {
  try {
    const { mode } = req.body as { mode?: string };
    if (mode !== "paper" && mode !== "live") {
      return res.status(400).json({ error: "mode doit être 'paper' ou 'live'." });
    }
    await setTradingMode(mode);
    await logAudit(
      "trading_mode.change",
      `Mode de trading changé en ${mode.toUpperCase()}.`,
      { mode }
    );
    logger.info({ mode }, "broker: mode de trading mis à jour");
    return res.json({ mode });
  } catch (err) {
    logger.error({ err }, "broker: erreur lors du changement de mode");
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// ─── POST /api/broker/setup ───────────────────────────────────────────────────
// Crée la ligne broker_connections avec les credentials sauvegardés en base.
// Pour les clés personnelles SnapTrade, userId et userSecret sont fournis
// directement par l'utilisateur (visibles dans app.snaptrade.com → Account Settings).
// Idempotent — retourne la connexion existante si déjà configurée.
router.post("/broker/setup", async (req, res) => {
  try {
    const existing = await getConnection();
    if (existing) {
      return res.json({
        message: "Already set up",
        userId: existing.snaptradeUserId,
        status: existing.status,
      });
    }

    // Lire les 4 clés depuis la base
    const creds = await resolveCredentials();
    if (!creds.clientId || !creds.consumerKey) {
      return res.status(400).json({
        error: "Client ID et Consumer Key manquants. Sauvegarde d'abord tes 4 clés SnapTrade via le formulaire ci-dessus.",
      });
    }
    if (!creds.userId || !creds.userSecret) {
      return res.status(400).json({
        error: "User ID et User Secret manquants. Tu les trouves dans ton tableau de bord app.snaptrade.com → Account Settings. Sauvegarde d'abord tes 4 clés via le formulaire.",
      });
    }

    const [row] = await db
      .insert(brokerConnectionsTable)
      .values({ snaptradeUserId: creds.userId, snaptradeUserSecret: creds.userSecret, status: "pending" })
      .returning();

    logger.info({ userId: creds.userId }, "broker: setup complete — credentials personnels enregistrés");
    await logAudit("broker.setup", "Compte courtier SnapTrade initialisé avec clés personnelles.", { userId: creds.userId });
    return res.status(201).json({
      message: "Compte initialisé. Ouvre le portail pour lier Wealthsimple.",
      userId: row.snaptradeUserId,
      status: row.status,
    });
  } catch (err) {
    req.log.error({ err }, "broker: setup failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/connect-url ──────────────────────────────────────────────
// Returns a Connection Portal URL. Open it in the browser to link Wealthsimple.
router.get("/broker/connect-url", async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) {
      return res.status(400).json({
        error: "No broker setup found. Call POST /api/broker/setup first.",
      });
    }
    const redirectURI = await getConnectionPortalUrl(
      conn.snaptradeUserId,
      conn.snaptradeUserSecret,
      (req.query.reconnect as string) ?? undefined
    );
    return res.json({ redirectURI });
  } catch (err) {
    req.log.error({ err }, "broker: connect-url failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/status ───────────────────────────────────────────────────
router.get("/broker/status", async (_req, res) => {
  const mode = getTradingMode();
  const creds = await resolveCredentials();
  // Toutes les 4 clés nécessaires
  const hasCredentials = !!(creds.clientId && creds.consumerKey && creds.userId && creds.userSecret);

  const settings = await getRiskSettings();

  const conn = await getConnection();
  if (!conn) {
    return res.json({
      mode,
      hasCredentials,
      connected: false,
      status: "not_setup",
      maxOrderValue: settings.maxOrderValue,
      maxPortfolioExposure: settings.maxPortfolioExposure,
      largeOrderFrictionPct: settings.largeOrderFrictionPct,
    });
  }

  // Vérifie l'état de l'API SnapTrade (clientId + consumerKey suffisent pour ce ping)
  let apiOk = false;
  if (creds.clientId && creds.consumerKey) {
    try {
      const client = await getSnaptradeClientAsync();
      await client.apiStatus.check();
      apiOk = true;
    } catch {
      apiOk = false;
    }
  }

  return res.json({
    mode,
    hasCredentials,
    connected: conn.status === "connected",
    status: conn.status,
    userId: conn.snaptradeUserId,
    lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
    apiOk,
    // Kill-switch — persisté en base, survit aux redémarrages
    halted: conn.tradingHalted,
    haltedAt: conn.haltedAt?.toISOString() ?? null,
    // Seuils de risque — exposés pour piloter la friction UI (ex. confirmation
    // renforcée sur les gros ordres) sans dupliquer la config côté frontend.
    maxOrderValue: settings.maxOrderValue,
    maxPortfolioExposure: settings.maxPortfolioExposure,
    largeOrderFrictionPct: settings.largeOrderFrictionPct,
  });
});

// ─── POST /api/broker/sync ────────────────────────────────────────────────────
// Pull accounts from SnapTrade and store them in the DB.
router.post("/broker/sync", async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) return res.status(400).json({ error: "Not set up" });

    const accounts = await listAccounts(conn.snaptradeUserId, conn.snaptradeUserSecret);

    await db
      .update(brokerConnectionsTable)
      .set({
        status: "connected",
        accounts: accounts as Record<string, unknown>[],
        lastSyncedAt: new Date(),
      })
      .where(eq(brokerConnectionsTable.id, conn.id));

    logger.info({ count: (accounts as unknown[]).length }, "broker: sync complete");
    await logAudit("broker.sync", `Synchronisation courtier — ${(accounts as unknown[]).length} compte(s) récupéré(s).`);
    return res.json({ message: "Sync complete", accounts });
  } catch (err) {
    req.log.error({ err }, "broker: sync failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/accounts ─────────────────────────────────────────────────
router.get("/broker/accounts", async (_req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) return res.status(400).json({ error: "Not set up" });

    // Try live fetch first; fall back to cached if SnapTrade is unavailable
    try {
      const accounts = await listAccounts(conn.snaptradeUserId, conn.snaptradeUserSecret);
      return res.json(accounts);
    } catch {
      // Return cached accounts from DB
      return res.json(conn.accounts ?? []);
    }
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/positions/:accountId ─────────────────────────────────────
router.get("/broker/positions/:accountId", async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) return res.status(400).json({ error: "Not set up" });

    const positions = await listPositions(
      conn.snaptradeUserId,
      conn.snaptradeUserSecret,
      req.params.accountId
    );
    return res.json(positions);
  } catch (err) {
    req.log.error({ err }, "broker: positions failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/balances/:accountId ──────────────────────────────────────
router.get("/broker/balances/:accountId", async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) return res.status(400).json({ error: "Not set up" });

    const balances = await listBalances(
      conn.snaptradeUserId,
      conn.snaptradeUserSecret,
      req.params.accountId
    );
    return res.json(balances);
  } catch (err) {
    req.log.error({ err }, "broker: balances failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/broker/orders ──────────────────────────────────────────────────
// Point d'entrée UNIQUE pour tous les ordres — boutons Acheter/Vendre manuels
// ET future exécution automatisée par signal. Délègue intégralement à
// submitOrder() qui applique le même pipeline de validation de risque pour
// toutes les provenances : idempotence → garde-fous (heures de marché, valeur
// max, exposition portefeuille) → dispatch paper/live.
router.post("/broker/orders", async (req, res) => {
  try {
    const {
      signalId,
      symbol,
      side,
      quantity,
      accountId,
      expectedPrice,
      source,
    } = req.body as {
      signalId?: string;
      symbol?: string;
      side?: string;
      quantity?: number;
      accountId?: string;
      expectedPrice?: number;
      source?: string;
    };

    // Récupérer la connexion courtier (nécessaire en mode live uniquement,
    // mais on la passe toujours — submitOrder ignore si mode=paper).
    const conn = await getConnection();

    const result = await submitOrder({
      signalId: signalId ?? "",
      symbol: symbol ?? "",
      side: side ?? "",
      quantity: quantity ?? 0,
      accountId,
      expectedPrice,
      source: source ?? "manual",
      brokerConnection: conn
        ? { snaptradeUserId: conn.snaptradeUserId, snaptradeUserSecret: conn.snaptradeUserSecret }
        : null,
    });

    // Ordre refusé par les garde-fous de risque → 422 avec message explicite
    if (result.status === "rejected") {
      req.log.warn({ signalId, symbol, side, quantity, reason: result.reason }, "broker: order rejected by risk guardrails");
      return res.status(422).json({
        error: result.message,
        reason: result.reason,
        details: result.details,
        rejected: true,
      });
    }

    // Doublon idempotent → 200, ordre original
    if (result.status === "duplicate") {
      req.log.info({ signalId }, "broker: duplicate order suppressed (idempotence)");
      return res.status(200).json(result.order);
    }

    // Accepté → 201
    return res.status(201).json(result.order);
  } catch (err) {
    if (err instanceof OrderValidationError) {
      return res.status(400).json({ error: String(err) });
    }
    req.log.error({ err }, "broker: order failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/broker/reset ───────────────────────────────────────────────────
// Réinitialise complètement la connexion courtier : supprime la ligne
// broker_connections pour permettre un nouvel Initialiser propre.
router.post("/broker/reset", async (req, res) => {
  try {
    await db.delete(brokerConnectionsTable);
    // Efface aussi userId/userSecret de app_settings (seront régénérés au prochain setup)
    const rows = await db.select().from(appSettingsTable).limit(1);
    if (rows.length > 0) {
      await db
        .update(appSettingsTable)
        .set({ snaptradeUserId: null, snaptradeUserSecret: null })
        .where(eq(appSettingsTable.id, rows[0].id));
    }
    await logAudit("broker.reset", "Connexion courtier réinitialisée — prêt pour un nouveau setup.");
    logger.info("broker: connexion réinitialisée");
    return res.json({ ok: true, message: "Connexion réinitialisée. Clique Initialiser pour recommencer." });
  } catch (err) {
    logger.error({ err }, "broker: reset failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/broker/halt ────────────────────────────────────────────────────
// Kill-switch : suspend immédiatement tout nouvel ordre live.
// Persisté en base — survit aux redémarrages du serveur.
// Tout ordre soumis tant que le kill-switch est actif est rejeté en amont
// du courtier, quelle que soit sa provenance (manuel ou automatisé).
router.post("/broker/halt", async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) return res.status(400).json({ error: "Aucune connexion courtier configurée." });
    await db
      .update(brokerConnectionsTable)
      .set({ tradingHalted: true, haltedAt: new Date() })
      .where(eq(brokerConnectionsTable.id, conn.id));
    req.log.warn({ userId: conn.snaptradeUserId }, "broker: KILL SWITCH ACTIVATED — all live orders blocked");
    await logAudit("kill_switch.enable", "Kill-switch activé — tous les nouveaux ordres live sont bloqués.");
    await notifyKillSwitchActivated();
    return res.json({ halted: true, haltedAt: new Date().toISOString(), message: "Trading suspendu. Aucun ordre ne sera soumis au courtier." });
  } catch (err) {
    req.log.error({ err }, "broker: halt failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/broker/resume ──────────────────────────────────────────────────
// Désactive le kill-switch et réautorise les ordres live.
// Requiert une action manuelle explicite dans l'UI — ne s'active jamais seul.
router.post("/broker/resume", async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) return res.status(400).json({ error: "Aucune connexion courtier configurée." });
    await db
      .update(brokerConnectionsTable)
      .set({ tradingHalted: false, haltedAt: null })
      .where(eq(brokerConnectionsTable.id, conn.id));
    req.log.info({ userId: conn.snaptradeUserId }, "broker: kill switch deactivated — live orders re-enabled");
    await logAudit("kill_switch.disable", "Kill-switch désactivé — les ordres live sont de nouveau acceptés.");
    return res.json({ halted: false, message: "Trading réactivé. Les ordres live sont à nouveau acceptés." });
  } catch (err) {
    req.log.error({ err }, "broker: resume failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/reconciliation ───────────────────────────────────────────
// Compare les positions détenues chez le courtier (source de vérité en mode
// live) aux positions calculées à partir de l'historique interne des ordres.
// Un écart signale un trade fait directement dans l'app Wealthsimple (hors
// Soliris Market) ou un bug de synchronisation — jamais une chose à corriger
// automatiquement, seulement à signaler pour vérification manuelle.
router.get("/broker/reconciliation", async (req, res) => {
  try {
    const mode = getTradingMode();
    const conn = await getConnection();

    let brokerPositionsRaw: unknown[] = [];
    let brokerFetchError: string | null = null;
    const accountId = req.query.accountId as string | undefined;

    if (conn && conn.status === "connected") {
      try {
        const accounts = accountId
          ? [{ id: accountId }]
          : ((conn.accounts as { id: string }[] | null) ?? []);
        for (const acc of accounts) {
          if (!acc?.id) continue;
          const positions = await listPositions(conn.snaptradeUserId, conn.snaptradeUserSecret, acc.id);
          brokerPositionsRaw.push(...(positions as unknown[]));
        }
      } catch (err) {
        brokerFetchError = String(err);
        logger.warn({ err }, "broker: reconciliation — failed to fetch live positions");
      }
    }

    // Normaliser les positions courtier par symbole (unités nettes)
    const brokerUnitsBySymbol = new Map<string, { units: number; currency: string; price: number }>();
    for (const raw of brokerPositionsRaw) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = raw as any;
      const symbol: string = (p?.symbol?.symbol?.ticker ?? p?.symbol?.ticker ?? p?.symbol ?? "").toUpperCase();
      const units = Number(p?.units ?? p?.quantity ?? 0);
      if (!symbol) continue;
      const price = Number(p?.price ?? p?.current_price ?? 0);
      const currency = (p?.symbol?.currency?.code ?? p?.currency ?? "USD").toUpperCase();
      const existing = brokerUnitsBySymbol.get(symbol);
      brokerUnitsBySymbol.set(symbol, { units: (existing?.units ?? 0) + units, currency, price });
    }

    // Positions internes calculées à partir des ordres (toujours, pour comparaison)
    const orders = await db.select().from(ordersTable).where(eq(ordersTable.mode, mode));
    const relevant = orders.filter((o) => ["simulated", "submitted", "filled", "partially_filled"].includes(o.status));
    const internalUnitsBySymbol = new Map<string, number>();
    for (const o of relevant) {
      const qty = Number(o.filledQuantity ?? o.quantity ?? 0);
      const signed = o.side.toUpperCase() === "BUY" ? qty : -qty;
      internalUnitsBySymbol.set(o.symbol, (internalUnitsBySymbol.get(o.symbol) ?? 0) + signed);
    }

    const symbols = new Set([...brokerUnitsBySymbol.keys(), ...internalUnitsBySymbol.keys()]);
    const TOLERANCE_UNITS = 0.0001; // écarts d'arrondi négligeables
    const rows = [...symbols].map((symbol) => {
      const broker = brokerUnitsBySymbol.get(symbol)?.units ?? 0;
      const internal = internalUnitsBySymbol.get(symbol) ?? 0;
      const diff = broker - internal;
      return {
        symbol,
        brokerUnits: broker,
        internalUnits: internal,
        diff,
        matches: Math.abs(diff) <= TOLERANCE_UNITS,
        currency: brokerUnitsBySymbol.get(symbol)?.currency ?? null,
      };
    }).sort((a, b) => (a.matches === b.matches ? a.symbol.localeCompare(b.symbol) : a.matches ? 1 : -1));

    const mismatches = rows.filter((r) => !r.matches);

    return res.json({
      mode,
      brokerConnected: !!conn && conn.status === "connected",
      brokerFetchError,
      checkedAt: new Date().toISOString(),
      rows,
      mismatchCount: mismatches.length,
    });
  } catch (err) {
    req.log.error({ err }, "broker: reconciliation failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/broker/orders ───────────────────────────────────────────────────
// Historique des ordres (les 50 plus récents).
router.get("/broker/orders", async (_req, res) => {
  try {
    const orders = await db
      .select()
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt))
      .limit(50);
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
