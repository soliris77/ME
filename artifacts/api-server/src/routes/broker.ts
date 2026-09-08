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
  refreshConnection,
  getSnaptradeClientAsync,
  resolveCredentials,
  invalidateSnaptradeClient,
  cancelBrokerOrder,
} from "../lib/snaptrade";
import {
  getTradingMode, getLiveArm, armLiveTrading, disarmLiveTrading,
  LIVE_ARM_CONFIRMATION, MIN_LIVE_ARM_DURATION_MINUTES, MAX_LIVE_ARM_DURATION_MINUTES,
} from "../lib/tradingMode";
import { getAssetProfiles, getQuotes } from "../lib/yahoo";
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
// Sauvegarde Client ID + Consumer Key en base.
// Pour les comptes personnels SnapTrade, clientId = userId et consumerKey = userSecret.
router.post("/broker/credentials", async (req, res) => {
  try {
    const { clientId, consumerKey } = req.body as { clientId?: string; consumerKey?: string };

    if (!clientId || !consumerKey) {
      return res.status(400).json({ error: "Client ID et Consumer Key sont requis." });
    }

    const rows = await db.select().from(appSettingsTable).limit(1);
    if (rows.length === 0) {
      return res.status(503).json({ error: "Serveur pas encore initialisé. Réessaie dans quelques secondes." });
    }
    await db
      .update(appSettingsTable)
      .set({ snaptradeClientId: clientId, snaptradeConsumerKey: consumerKey })
      .where(eq(appSettingsTable.id, rows[0].id));

    invalidateSnaptradeClient();

    await logAudit("broker.credentials", "Clés SnapTrade mises à jour via l'interface (stockées en base).");
    logger.info("broker: clés SnapTrade mises à jour en base");
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
  try {
    const mode = getTradingMode();
    const creds = await resolveCredentials();
    const hasCredentials = !!(creds.clientId && creds.consumerKey);
    const arm = await getLiveArm();
    // Deliberately only expose non-secret arm state and limits.
    return res.json({
      mode,
      hasCredentials,
      arm: arm ? {
        accountId: arm.accountId,
        maxOrderValue: arm.maxOrderValue,
        dailyLossCap: arm.dailyLossCap,
        armedAt: arm.armedAt.toISOString(),
        expiresAt: arm.expiresAt.toISOString(),
        active: arm.expiresAt.getTime() > Date.now(),
      } : null,
    });
  } catch (err) {
    logger.error({ err }, "broker: unable to read trading arm");
    return res.status(500).json({ error: "Impossible de lire l'armement LIVE." });
  }
});

// ─── POST /api/broker/trading-mode ────────────────────────────────────────────
// LIVE is never a durable toggle: it requires an account-scoped, expiring,
// explicitly confirmed arm. Switching to paper always removes that authority.
router.post("/broker/trading-mode", async (req, res) => {
  try {
    const { mode, accountId, maxOrderValue, dailyLossCap, durationMinutes, expiresAt, confirmation } = req.body as {
      mode?: string; accountId?: string; maxOrderValue?: unknown; dailyLossCap?: unknown;
      durationMinutes?: unknown; expiresAt?: unknown; confirmation?: unknown;
    };
    if (mode !== "paper" && mode !== "live") {
      return res.status(400).json({ error: "mode doit être 'paper' ou 'live'." });
    }
    if (mode === "paper") {
      await disarmLiveTrading();
      await logAudit("trading_mode.change", "Mode de trading changé en PAPER; armement LIVE effacé.", { mode });
      return res.json({ mode: "paper", arm: null });
    }
    if (typeof accountId !== "string" || !accountId.trim()) {
      return res.status(400).json({ error: "accountId est requis pour armer le mode LIVE." });
    }
    const max = typeof maxOrderValue === "number" ? maxOrderValue : Number(maxOrderValue);
    const loss = typeof dailyLossCap === "number" ? dailyLossCap : Number(dailyLossCap);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(loss) || loss <= 0) {
      return res.status(400).json({ error: "maxOrderValue et dailyLossCap doivent être des nombres positifs." });
    }
    if (confirmation !== LIVE_ARM_CONFIRMATION) {
      return res.status(400).json({ error: `confirmation doit être exactement « ${LIVE_ARM_CONFIRMATION} ».`, confirmationRequired: LIVE_ARM_CONFIRMATION });
    }
    let expiry: Date;
    if (durationMinutes !== undefined && expiresAt !== undefined) {
      return res.status(400).json({ error: "Fournissez durationMinutes ou expiresAt, pas les deux." });
    }
    if (durationMinutes !== undefined) {
      const duration = typeof durationMinutes === "number" ? durationMinutes : Number(durationMinutes);
      if (!Number.isInteger(duration) || duration < MIN_LIVE_ARM_DURATION_MINUTES || duration > MAX_LIVE_ARM_DURATION_MINUTES) {
        return res.status(400).json({ error: `durationMinutes doit être un entier entre ${MIN_LIVE_ARM_DURATION_MINUTES} et ${MAX_LIVE_ARM_DURATION_MINUTES}.` });
      }
      expiry = new Date(Date.now() + duration * 60_000);
    } else {
      expiry = new Date(typeof expiresAt === "string" ? expiresAt : "");
      const remaining = expiry.getTime() - Date.now();
      if (!Number.isFinite(expiry.getTime()) || remaining < MIN_LIVE_ARM_DURATION_MINUTES * 60_000 || remaining > MAX_LIVE_ARM_DURATION_MINUTES * 60_000) {
        return res.status(400).json({ error: `expiresAt doit être entre ${MIN_LIVE_ARM_DURATION_MINUTES} et ${MAX_LIVE_ARM_DURATION_MINUTES} minutes dans le futur.` });
      }
    }
    const conn = await getConnection();
    if (!conn || conn.status !== "connected") {
      return res.status(400).json({ error: "Une connexion SnapTrade active est requise pour armer le mode LIVE." });
    }
    // Ask SnapTrade rather than trusting a stale cache before granting live authority.
    const accounts = await listAccounts(conn.snaptradeUserId, conn.snaptradeUserSecret);
    if (!(accounts as { id?: string }[]).some((account) => account?.id === accountId)) {
      return res.status(400).json({ error: "accountId ne correspond pas à un compte SnapTrade connecté." });
    }
    const armedAt = new Date();
    await armLiveTrading({ accountId, maxOrderValue: max, dailyLossCap: loss, armedAt, expiresAt: expiry });
    await logAudit(
      "trading_mode.change",
      "Mode LIVE armé temporairement.",
      { mode, accountId, maxOrderValue: max, dailyLossCap: loss, armedAt: armedAt.toISOString(), expiresAt: expiry.toISOString() }
    );
    logger.warn({ mode, accountId, expiresAt: expiry }, "broker: temporary live trading arm created");
    return res.json({ mode: "live", arm: { accountId, maxOrderValue: max, dailyLossCap: loss, armedAt: armedAt.toISOString(), expiresAt: expiry.toISOString(), active: true } });
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
        error: "Client ID et Consumer Key manquants. Sauvegarde d'abord tes clés via le formulaire ci-dessus.",
      });
    }

    // Pour les comptes personnels SnapTrade : clientId = userId, consumerKey = userSecret
    const [row] = await db
      .insert(brokerConnectionsTable)
      .values({ snaptradeUserId: creds.clientId, snaptradeUserSecret: creds.consumerKey, status: "pending" })
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
  const hasCredentials = !!(creds.clientId && creds.consumerKey);

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

// ─── POST /api/broker/refresh ────────────────────────────────────────────────
// Demande à SnapTrade de re-synchroniser depuis le courtier.
// ⚠️  SnapTrade peut facturer cet appel — bouton manuel uniquement, pas auto.
router.post("/broker/refresh", async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) return res.status(400).json({ error: "Not set up" });

    await refreshConnection(conn.snaptradeUserId, conn.snaptradeUserSecret);
    await logAudit("broker.refresh", "Rafraîchissement manuel des soldes SnapTrade demandé.");
    logger.info("broker: refresh connexion demandé");
    return res.json({ ok: true, message: "Rafraîchissement demandé — les soldes seront mis à jour dans quelques secondes." });
  } catch (err) {
    req.log.error({ err }, "broker: refresh failed");
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
      orderType,
      stopPrice,
    } = req.body as {
      signalId?: string;
      symbol?: string;
      side?: string;
      quantity?: number;
      accountId?: string;
      expectedPrice?: number;
      source?: string;
      orderType?: string;
      stopPrice?: number;
    };

    // Validation stricte du type d'ordre au boundary HTTP — fail closed :
    // absence => market ; toute autre valeur que "market"/"stop" => 400,
    // jamais de repli silencieux vers un ordre market réel.
    if (orderType !== undefined && orderType !== "market" && orderType !== "stop") {
      return res.status(400).json({ error: `orderType invalide : "${orderType}" (valeurs acceptées : "market", "stop")` });
    }

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
      orderType: orderType === "stop" ? "stop" : "market",
      stopPrice,
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

// ─── GET /api/broker/allocation ───────────────────────────────────────────────
// Répartition du portefeuille : secteurs, devises, espèces vs investi.
// Agrège les positions + soldes de tous les comptes SnapTrade liés.
// Le secteur vient de Yahoo Finance (assetProfile, cache serveur 24 h).
// Les montants sont convertis en CAD via USDCAD=X pour les graphiques agrégés ;
// si le taux est indisponible, on le signale explicitement (fxWarning) au lieu
// de mélanger silencieusement des devises.
router.get("/broker/allocation", async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) {
      return res.json({ connected: false, reason: "not_setup", message: "Courtier non configuré. Configure la connexion SnapTrade ci-dessus." });
    }
    if (conn.status !== "connected") {
      return res.json({ connected: false, reason: conn.status, message: "Connexion courtier pas encore active. Termine la liaison Wealthsimple puis synchronise." });
    }

    const accounts = ((conn.accounts as { id?: string; name?: string }[] | null) ?? []).filter((a) => a?.id);
    if (accounts.length === 0) {
      return res.json({ connected: true, empty: true, message: "Aucun compte synchronisé. Clique « Synchroniser maintenant » puis réessaie." });
    }

    // ── Récupérer positions + soldes de chaque compte ──
    const accountErrors: { accountId: string; name: string | null; error: string }[] = [];
    interface RawPos { symbol: string; description: string | null; units: number; price: number; currency: string }
    const rawPositions: RawPos[] = [];
    const cashByCurrency = new Map<string, number>();

    await Promise.all(accounts.map(async (acc) => {
      const accountId = acc.id as string;
      try {
        const [positions, balances] = await Promise.all([
          listPositions(conn.snaptradeUserId, conn.snaptradeUserSecret, accountId),
          listBalances(conn.snaptradeUserId, conn.snaptradeUserSecret, accountId),
        ]);
        for (const raw of positions as unknown[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = raw as any;
          const symbol: string = (p?.symbol?.symbol?.symbol ?? p?.symbol?.symbol?.ticker ?? p?.symbol?.ticker ?? "").toUpperCase();
          const units = Number(p?.units ?? p?.quantity ?? 0);
          const price = Number(p?.price ?? p?.current_price ?? 0);
          if (!symbol || !Number.isFinite(units) || units === 0) continue;
          // Les équivalents de trésorerie (fonds monétaires) sont déjà comptés
          // dans le solde cash SnapTrade — les inclure ici les compterait deux fois.
          if (p?.cash_equivalent === true) continue;
          // Devise de la POSITION (celle de `price`) — peut différer de la devise
          // de cotation du titre (symbol.symbol.currency). SnapTrade la fournit
          // en priorité au niveau Position.currency ; les autres champs ne sont
          // que des replis de compatibilité.
          const currency = String(
            p?.currency?.code
            ?? p?.symbol?.symbol?.currency?.code
            ?? p?.symbol?.currency?.code
            ?? "USD",
          ).toUpperCase();
          const description: string | null = p?.symbol?.symbol?.description ?? p?.symbol?.description ?? null;
          rawPositions.push({ symbol, description, units, price, currency });
        }
        for (const raw of balances as unknown[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b = raw as any;
          const currency = String(b?.currency?.code ?? b?.currency ?? "").toUpperCase();
          const cash = Number(b?.cash ?? 0);
          if (!currency || !Number.isFinite(cash)) continue;
          cashByCurrency.set(currency, (cashByCurrency.get(currency) ?? 0) + cash);
        }
      } catch (err) {
        accountErrors.push({ accountId, name: acc.name ?? null, error: String(err) });
      }
    }));

    if (rawPositions.length === 0 && cashByCurrency.size === 0 && accountErrors.length > 0) {
      return res.status(502).json({
        connected: true,
        error: "Impossible de récupérer les positions depuis SnapTrade pour tous les comptes.",
        accountErrors,
      });
    }

    // ── Taux USD→CAD (et signalement explicite s'il manque) ──
    const foreignCurrencies = new Set<string>();
    for (const p of rawPositions) if (p.currency !== "CAD") foreignCurrencies.add(p.currency);
    for (const c of cashByCurrency.keys()) if (c !== "CAD") foreignCurrencies.add(c);

    const fxRates = new Map<string, number>([["CAD", 1]]);
    let fxWarning: string | null = null;
    if (foreignCurrencies.size > 0) {
      const fxSymbols = [...foreignCurrencies].map((c) => `${c}CAD=X`);
      const fxQuotes = await getQuotes(fxSymbols);
      for (const q of fxQuotes) {
        const cur = q.symbol.replace("CAD=X", "");
        if (q.price > 0) fxRates.set(cur, q.price);
      }
      const missing = [...foreignCurrencies].filter((c) => !fxRates.has(c));
      if (missing.length > 0) {
        fxWarning = `Taux de change indisponible pour : ${missing.join(", ")}. Ces montants sont exclus des totaux en CAD.`;
      }
    }
    const toCad = (amount: number, currency: string): number | null => {
      const rate = fxRates.get(currency);
      return rate == null ? null : amount * rate;
    };

    // ── Secteurs via Yahoo (cache 24 h) ──
    const profiles = await getAssetProfiles(rawPositions.map((p) => p.symbol));
    const sectorLabel = (symbol: string): string => {
      const prof = profiles.get(symbol);
      if (prof?.sector) return prof.sector;
      const qt = (prof?.quoteType ?? "").toUpperCase();
      if (qt === "ETF" || qt === "MUTUALFUND") return "FNB / Fonds";
      if (qt === "CRYPTOCURRENCY") return "Crypto";
      return "Secteur inconnu";
    };

    // ── Agrégations ──
    interface PositionOut { symbol: string; description: string | null; units: number; price: number; currency: string; value: number; valueCad: number | null; sector: string }
    const positionsOut: PositionOut[] = rawPositions.map((p) => {
      const value = p.units * p.price;
      return { ...p, value, valueCad: toCad(value, p.currency), sector: sectorLabel(p.symbol) };
    });

    const bySectorMap = new Map<string, { valueCad: number; symbols: Set<string> }>();
    let investedCad = 0;
    for (const p of positionsOut) {
      if (p.valueCad == null) continue; // devise sans taux — signalée via fxWarning
      investedCad += p.valueCad;
      const entry = bySectorMap.get(p.sector) ?? { valueCad: 0, symbols: new Set<string>() };
      entry.valueCad += p.valueCad;
      entry.symbols.add(p.symbol);
      bySectorMap.set(p.sector, entry);
    }

    let cashCad = 0;
    for (const [cur, amount] of cashByCurrency) {
      const v = toCad(amount, cur);
      if (v != null) cashCad += v;
    }
    const totalCad = investedCad + cashCad;

    const bySector = [...bySectorMap.entries()]
      .map(([sector, e]) => ({
        sector,
        valueCad: e.valueCad,
        weightPct: investedCad > 0 ? (e.valueCad / investedCad) * 100 : 0,
        symbols: [...e.symbols].sort(),
      }))
      .sort((a, b) => b.valueCad - a.valueCad);

    // Par devise : investi + espèces, en valeur native et en CAD
    const currencySet = new Set<string>([...cashByCurrency.keys(), ...rawPositions.map((p) => p.currency)]);
    const byCurrency = [...currencySet].map((cur) => {
      const invested = positionsOut.filter((p) => p.currency === cur).reduce((s, p) => s + p.value, 0);
      const cash = cashByCurrency.get(cur) ?? 0;
      const total = invested + cash;
      return { currency: cur, invested, cash, total, totalCad: toCad(total, cur) };
    }).sort((a, b) => (b.totalCad ?? 0) - (a.totalCad ?? 0));

    return res.json({
      connected: true,
      empty: positionsOut.length === 0 && cashByCurrency.size === 0,
      asOf: new Date().toISOString(),
      baseCurrency: "CAD",
      fxRates: Object.fromEntries(fxRates),
      fxWarning,
      accountErrors,
      totals: { investedCad, cashCad, totalCad, cashPct: totalCad > 0 ? (cashCad / totalCad) * 100 : 0 },
      bySector,
      byCurrency,
      positions: positionsOut.sort((a, b) => (b.valueCad ?? 0) - (a.valueCad ?? 0)),
    });
  } catch (err) {
    req.log.error({ err }, "broker: allocation failed");
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

// ─── GET /api/broker/stop-orders ──────────────────────────────────────────────
// Ordres stop de protection, avec statut rafraîchi depuis le courtier.
// En mode live avec connexion active, on synchronise d'abord les statuts
// SnapTrade (submitted → filled / cancelled / rejected) avant de répondre —
// l'utilisateur voit donc l'état réel, pas le statut initial "submitted".
router.get("/broker/stop-orders", async (req, res) => {
  try {
    const mode = getTradingMode();
    const conn = await getConnection();
    let syncError: string | null = null;

    if (mode === "live" && conn && conn.status === "connected") {
      try {
        const { syncLiveOrderFills } = await import("../workers/autoTradeWorker");
        await syncLiveOrderFills(conn);
      } catch (err) {
        syncError = String(err);
        req.log.warn({ err }, "broker: stop-orders — sync des statuts SnapTrade échouée, statuts en cache renvoyés");
      }
    }

    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.orderType, "stop"))
      .orderBy(desc(ordersTable.createdAt))
      .limit(50);

    // "actif" = le stop protège encore la position : accepté par le courtier
    // (submitted/pending) ou simulé en mode paper.
    const ACTIVE_STATUSES = ["pending", "submitted", "simulated"];
    return res.json({
      mode,
      syncedFromBroker: mode === "live" && !!conn && conn.status === "connected" && !syncError,
      syncError,
      orders: orders.map((o) => ({ ...o, active: ACTIVE_STATUSES.includes(o.status) })),
    });
  } catch (err) {
    req.log.error({ err }, "broker: stop-orders failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/broker/orders/:id/cancel ───────────────────────────────────────
// Annule un ordre stop actif. En mode live, l'annulation est demandée à
// SnapTrade — le statut local ne passe à "cancelled" QUE si le courtier
// confirme (jamais d'annulation locale optimiste : un stop qu'on croit annulé
// mais encore actif — ou l'inverse — est dangereux).
router.post("/broker/orders/:id/cancel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Identifiant d'ordre invalide." });
    }

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Ordre introuvable." });
    if (order.orderType !== "stop") {
      return res.status(400).json({ error: "Seuls les ordres stop de protection peuvent être annulés ici." });
    }

    const CANCELLABLE = ["pending", "submitted", "simulated"];
    if (!CANCELLABLE.includes(order.status)) {
      return res.status(409).json({
        error: `Cet ordre n'est plus annulable (statut : ${order.status}). Rafraîchis la liste pour voir son état final.`,
        status: order.status,
      });
    }

    // Ordre paper (simulé) — annulation purement locale.
    if (order.mode === "paper") {
      const [updated] = await db
        .update(ordersTable)
        .set({ status: "cancelled" })
        .where(eq(ordersTable.id, id))
        .returning();
      await logAudit("order.cancel", `Ordre stop paper #${id} (${order.symbol}) annulé.`, { orderId: id, symbol: order.symbol, mode: "paper" });
      logger.info({ orderId: id, symbol: order.symbol }, "broker: ordre stop paper annulé");
      return res.json({ ok: true, order: updated });
    }

    // Ordre live — annulation via SnapTrade, jamais locale seule.
    if (!order.snaptradeOrderId || !order.brokerAccountId) {
      return res.status(409).json({
        error: "Ordre live sans identifiant courtier — impossible de l'annuler via SnapTrade. Vérifie-le directement dans Wealthsimple.",
      });
    }
    const conn = await getConnection();
    if (!conn) return res.status(400).json({ error: "Aucune connexion courtier configurée." });

    try {
      await cancelBrokerOrder({
        userId: conn.snaptradeUserId,
        userSecret: conn.snaptradeUserSecret,
        accountId: order.brokerAccountId,
        brokerageOrderId: order.snaptradeOrderId,
      });
    } catch (err) {
      // Le courtier a refusé (déjà exécuté/annulé ?) — on re-synchronise le
      // statut réel plutôt que de laisser un état trompeur.
      req.log.warn({ err, orderId: id }, "broker: annulation SnapTrade refusée — resynchronisation du statut");
      try {
        const { syncLiveOrderFills } = await import("../workers/autoTradeWorker");
        await syncLiveOrderFills(conn);
      } catch { /* statut en cache conservé */ }
      const [fresh] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
      return res.status(409).json({
        error: "Le courtier a refusé l'annulation — l'ordre a peut-être déjà été exécuté ou annulé.",
        status: fresh?.status ?? order.status,
        details: String(err),
      });
    }

    const [updated] = await db
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, id))
      .returning();
    await logAudit("order.cancel", `Ordre stop live #${id} (${order.symbol}) annulé chez le courtier.`, { orderId: id, symbol: order.symbol, mode: "live", snaptradeOrderId: order.snaptradeOrderId });
    logger.info({ orderId: id, symbol: order.symbol, snaptradeOrderId: order.snaptradeOrderId }, "broker: ordre stop live annulé via SnapTrade");
    return res.json({ ok: true, order: updated });
  } catch (err) {
    req.log.error({ err }, "broker: cancel order failed");
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
