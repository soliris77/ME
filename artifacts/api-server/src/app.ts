import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/auth";
import { startCopyTradingSync } from "./lib/integrations/metatrader/sync";
import { initTradingMode } from "./lib/tradingMode";

const app: Express = express();

// Requis pour que les cookies "secure" fonctionnent correctement derrière le
// proxy TLS de Replit (sinon Express voit une requête HTTP en interne).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

app.use("/api", router);

// Charger le mode de trading depuis la DB au démarrage
initTradingMode().catch((err) => logger.warn({ err }, "initTradingMode: échec"));

// Démarrer le job de synchronisation Copy Trading
startCopyTradingSync();

export default app;
