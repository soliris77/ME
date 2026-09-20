import { Router, type IRouter } from "express";
import healthRouter from "./health";
import quotesRouter from "./quotes";
import marketRouter from "./market";
import newsRouter from "./news";
import watchlistRouter from "./watchlist";
import alertsRouter from "./alerts";
import whopRouter from "./whop";
import brokerRouter from "./broker";
import authRouter from "./auth";
import settingsRouter from "./settings";
import notificationPreferencesRouter from "./notificationPreferences";
import auditRouter from "./audit";
import performanceRouter from "./performance";
import calendarRouter from "./calendar";
import learnRouter from "./learn";
import notesRouter from "./notes";
import clientErrorsRouter from "./clientErrors";
import metatraderRouter from "./metatrader";
import copyTradingRouter from "./copyTrading";
import symbolsRouter from "./symbols";
import agentTasksRouter from "./agentTasks";
import autoTraderRouter from "./autoTrader";
import perpsRouter from "./perps";
import dailySummaryRouter from "./dailySummary";
import scannerRouter from "./scanner";
import signalsRouter from "./signals";
import debriefRouter from "./debrief";
import { requireAuth } from "../lib/auth";
import pushRouter from "./push";
import notificationsRouter from "./notifications";
import thesesRouter from "./theses";
import subscriptionRouter from "./subscription";
import { requirePremium } from "../lib/subscription";

const router: IRouter = Router();

// ─── Routes publiques — pas de session requise ─────────────────────────────
router.use(healthRouter);
router.use(authRouter);
router.use(clientErrorsRouter);

// ─── Routes protégées — 401 immédiat sans session authentifiée ────────────
router.use(requireAuth);
router.use(subscriptionRouter);
router.use(quotesRouter);
router.use(marketRouter);
router.use(newsRouter);
router.use(watchlistRouter);
router.use(alertsRouter);
router.use(notificationsRouter);
router.use(thesesRouter);
router.use(whopRouter);
router.use(brokerRouter);
router.use(settingsRouter);
router.use(notificationPreferencesRouter);
router.use(auditRouter);
router.use(performanceRouter);
router.use(calendarRouter);
router.use(learnRouter);
router.use(notesRouter);
router.use(metatraderRouter);
router.use(requirePremium, copyTradingRouter);
router.use(symbolsRouter);
router.use(agentTasksRouter);
router.use(requirePremium, autoTraderRouter);
// Lot 10 : contrats perpetuels a levier. Double serrure interne.
router.use(requirePremium, perpsRouter);
router.use(dailySummaryRouter);
// Lots 8 et 9 : pilotage et mesure. Le webhook d'entree des signaux, lui,
// est monte hors de /api dans app.ts et s'authentifie par signature HMAC.
router.use(scannerRouter);
router.use(signalsRouter);
router.use(debriefRouter);
router.use(pushRouter);

export default router;
