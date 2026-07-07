import app from "./app";
import { logger } from "./lib/logger";
import { startAlertWorker } from "./workers/alertWorker";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const alertIntervalMs = Number(process.env.ALERT_CHECK_INTERVAL_MS ?? "90000");
  startAlertWorker(Number.isFinite(alertIntervalMs) && alertIntervalMs > 0 ? alertIntervalMs : undefined);
});
