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
import spotifyRouter from "./spotify";
import symbolsRouter from "./symbols";
import agentTasksRouter from "./agentTasks";
import autoTraderRouter from "./autoTrader";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// ─── Routes publiques — pas de session requise ─────────────────────────────
router.use(healthRouter);
router.use(authRouter);
router.use(clientErrorsRouter);

// ─── Routes protégées — 401 immédiat sans session authentifiée ────────────
router.use(requireAuth);
router.use(quotesRouter);
router.use(marketRouter);
router.use(newsRouter);
router.use(watchlistRouter);
router.use(alertsRouter);
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
router.use(copyTradingRouter);
router.use(spotifyRouter);
router.use(symbolsRouter);
router.use(agentTasksRouter);
router.use(autoTraderRouter);

export default router;
