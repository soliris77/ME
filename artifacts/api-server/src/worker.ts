import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { logger } from "./lib/logger";
import { startAutoTradeWorker, stopAutoTradeWorker } from "./workers/autoTradeWorker";
import ccxt from "ccxt";
import { CcxtFeed, YahooFeed } from "@workspace/market-data";
import { configureMarketDataFeeds } from "./workers/autoTradeWorker";
import { WorkerLeaseCoordinator, databaseLeaseRepository, type LeaseRepository } from "./workers/workerLease";

export interface WorkerBootstrapOptions {
  lease?: WorkerLeaseCoordinator;
  repository?: LeaseRepository;
  ownerToken?: string;
  retryMs?: number;
  /** Skip the asynchronous startup acquisition when a caller will tick manually. */
  initialTick?: boolean;
  start?: () => void;
  stop?: () => void;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

/**
 * Starts the lease-controlled worker. Keeping this separate from module
 * evaluation makes the worker safe to import in tests and guarantees that the
 * worker entry point never starts a timer merely because it was imported.
 */
export function startWorker(options: WorkerBootstrapOptions = {}) {
  configureMarketDataFeeds({
    equity: new YahooFeed(),
    crypto: new CcxtFeed({ exchange: new (ccxt as any).kraken({ enableRateLimit: true }) }),
  });

  const lease = options.lease ?? new WorkerLeaseCoordinator(
    options.repository ?? databaseLeaseRepository,
    options.ownerToken ?? randomUUID(),
  );
  const start = options.start ?? startAutoTradeWorker;
  const stop = options.stop ?? stopAutoTradeWorker;
  const retryMs = options.retryMs ?? 30_000;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let retry: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (!lease.isActive()) {
      if (await lease.tryAcquire()) {
        logger.info("autoTradeWorker: database lease acquired");
        start();
      }
      return;
    }
    if (!await lease.renew()) {
      // Stop synchronously as soon as renewal loses the fence, before another
      // scheduled cycle can begin.
      stop();
      logger.warn("autoTradeWorker: database lease lost");
    }
  };

  if (options.initialTick !== false) {
    void tick().catch((err) => logger.error({ err }, "worker: initial lease tick failed"));
  }
  retry = setIntervalFn(() => {
    void tick().catch((err) => logger.error({ err }, "worker: lease tick failed"));
  }, retryMs);

  return {
    lease,
    tick,
    async shutdown(): Promise<void> {
      if (stopped) return;
      stopped = true;
      if (retry) clearIntervalFn(retry);
      stop();
      await lease.release();
    },
  };
}

async function main(): Promise<void> {
  const worker = startWorker();
  const shutdown = async () => {
    await worker.shutdown();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

// Importing this module (including from tests) has no timers or side effects.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}