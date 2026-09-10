import { CcxtAdapter } from "@workspace/broker";

const apiKey = process.env.KRAKEN_API_KEY;
const secret = process.env.KRAKEN_API_SECRET;
if (!apiKey || !secret) {
  console.error("KRAKEN_API_KEY and KRAKEN_API_SECRET are required");
  process.exit(1);
}

const adapter = new CcxtAdapter("kraken-smoke", {
  exchangeId: "kraken",
  apiKey,
  secret,
});
const balances = await adapter.getBalances("kraken-smoke");
const limits = await adapter.getMarketLimits("BTC-USD");
console.log(JSON.stringify({ balances, market: "BTC-USD", limits }, null, 2));