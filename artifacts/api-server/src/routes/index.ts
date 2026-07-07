import { Router, type IRouter } from "express";
import healthRouter from "./health";
import quotesRouter from "./quotes";
import marketRouter from "./market";
import newsRouter from "./news";
import watchlistRouter from "./watchlist";
import alertsRouter from "./alerts";
import whopRouter from "./whop";

const router: IRouter = Router();

router.use(healthRouter);
router.use(quotesRouter);
router.use(marketRouter);
router.use(newsRouter);
router.use(watchlistRouter);
router.use(alertsRouter);
router.use(whopRouter);

export default router;
