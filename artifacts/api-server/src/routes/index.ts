import { Router, type IRouter } from "express";
import healthRouter from "./health";
import quotesRouter from "./quotes";
import marketRouter from "./market";
import watchlistRouter from "./watchlist";
import alertsRouter from "./alerts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(quotesRouter);
router.use(marketRouter);
router.use(watchlistRouter);
router.use(alertsRouter);

export default router;
