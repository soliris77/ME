import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db, autoTradeRulesTable, brokerConnectionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { resolveCredentials, getSnaptradeClientAsync } from "../lib/snaptrade";
import { getQuotes, cotationPerimee } from "../lib/yahoo";
import { resolveCred } from "../lib/persistCreds";
import { isWhopConfigured } from "../whopClient";
import { getTradingMode } from "../lib/tradingMode";
import { getAutoTradeWorkerStatus } from "../workers/autoTradeWorker";

const router: IRouter = Router();
const CHECK_TIMEOUT_MS = 3_000;

type Status = "ok" | "degraded" | "not_configured";
type Entry = {
  status: Status;
  configured: boolean;
  summary: string;
  [key: string]: boolean | string | null;
};

/** Bound a diagnostic operation; callers receive no provider/credential errors. */
async function bounded<T>(operation: Promise<T>): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), CHECK_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Authenticated, read-only integration diagnostics.  Responses intentionally
 * contain presence/state flags only: no IDs, addresses, provider errors, or
 * secret-derived fragments are ever returned.
 */
router.get("/integrations/health", requireAuth, async (_req, res) => {
  const generatedAt = new Date().toISOString();

  const [snaptrade, yahoo, twilio, resend, whop, autoTrader] = await Promise.all([
    snaptradeHealth(),
    yahooHealth(),
    twilioHealth(),
    resendHealth(),
    Promise.resolve(whopHealth()),
    autoTraderHealth(),
  ]);
  const entries = { snaptrade, yahoo, twilio, resend, whop, autoTrader };
  const overall: "ok" | "degraded" = Object.values(entries).some((entry) => entry.status === "degraded")
    ? "degraded"
    : "ok";

  return res.json({ generatedAt, overall, entries });
});

async function snaptradeHealth(): Promise<Entry> {
  const credentials = await bounded(resolveCredentials());
  const configured = Boolean(credentials?.consumerKey);
  const connection = await bounded(
    db.select({
      status: brokerConnectionsTable.status,
    }).from(brokerConnectionsTable).orderBy(desc(brokerConnectionsTable.id)).limit(1),
  );

  if (connection === null) {
    return { status: "degraded", configured, database: "unavailable", reachable: "not_checked", summary: "Local connection state unavailable." };
  }
  if (!configured) {
    return { status: "not_configured", configured: false, database: "ok", reachable: "not_checked", summary: "Credentials are not configured." };
  }

  // apiStatus.check is the existing harmless SnapTrade read; it creates no
  // connection, refresh, or order and is bounded above.
  const client = await bounded(getSnaptradeClientAsync());
  const reachable = client
    ? await bounded(client.apiStatus.check()).then((result) => result !== null)
    : false;
  return {
    status: reachable ? "ok" : "degraded",
    configured: true,
    database: "ok",
    reachable: reachable ? "ok" : "unavailable",
    summary: reachable ? "Configured and reachable." : "Configured, but reachability check failed.",
  };
}

async function yahooHealth(): Promise<Entry> {
  // One fixed, public symbol keeps this harmless quote check bounded.
  const quotes = await bounded(getQuotes(["SPY"]));
  const quote = quotes?.[0];
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    return { status: "degraded", configured: true, reachable: "unavailable", fresh: false, summary: "Quote check unavailable." };
  }
  const fresh = !cotationPerimee(quote, 5 * 60 * 1000);
  return {
    status: fresh ? "ok" : "degraded",
    configured: true,
    reachable: "ok",
    fresh,
    summary: fresh ? "Quote check succeeded." : "Quote check returned stale market data.",
  };
}

async function twilioHealth(): Promise<Entry> {
  const values = await bounded(Promise.all([
    resolveCred("twilioAccountSid", "TWILIO_ACCOUNT_SID"),
    resolveCred("twilioAuthToken", "TWILIO_AUTH_TOKEN"),
    resolveCred("twilioFromNumber", "TWILIO_FROM_NUMBER"),
  ]));
  const configured = Boolean(values?.every(Boolean));
  return { status: configured ? "ok" : "not_configured", configured, summary: configured ? "Credentials are configured." : "Credentials are not fully configured." };
}

function resendHealth(): Entry {
  const configured = Boolean(process.env.RESEND_API_KEY);
  return { status: configured ? "ok" : "not_configured", configured, summary: configured ? "Credentials are configured." : "Credentials are not configured." };
}

function whopHealth(): Entry {
  const configured = isWhopConfigured();
  return { status: configured ? "ok" : "not_configured", configured, summary: configured ? "Integration is configured." : "Integration is not configured." };
}

async function autoTraderHealth(): Promise<Entry> {
  const [rules, connection] = await Promise.all([
    bounded(db.select({ id: autoTradeRulesTable.id }).from(autoTradeRulesTable).where(eq(autoTradeRulesTable.enabled, true)).limit(1)),
    bounded(db.select({ tradingHalted: brokerConnectionsTable.tradingHalted }).from(brokerConnectionsTable).orderBy(desc(brokerConnectionsTable.id)).limit(1)),
  ]);
  const worker = getAutoTradeWorkerStatus();
  if (rules === null || connection === null) {
    return { status: "degraded", configured: false, worker: worker.running ? "running" : "stopped", cycleInFlight: worker.cycleInFlight, rules: "unknown", mode: getTradingMode(), halted: null, summary: "Local state unavailable." };
  }
  const halted = connection[0]?.tradingHalted ?? false;
  return {
    status: worker.running ? "ok" : "degraded",
    configured: rules.length > 0,
    worker: worker.running ? "running" : "stopped",
    cycleInFlight: worker.cycleInFlight,
    rules: rules.length > 0 ? "active" : "none",
    mode: getTradingMode(),
    halted,
    summary: worker.running ? "Worker state available." : "Worker is not running.",
  };
}

export default router;
