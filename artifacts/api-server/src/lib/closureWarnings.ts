import {
  getExchangeForSymbol,
  getMarketHolidays,
  getEarlyCloseDays,
} from "./risk";

export interface ClosureWarning {
  kind: "early_close_today" | "holiday_next_business_day";
  exchange: "TSX" | "NASDAQ_NYSE";
  exchangeLabel: string;
  date: string;
  closesAt?: "13:00";
}

/** Pure market-calendar diagnostic used by the worker (does not import Express). */
export function computeClosureWarnings(symbol: string, now: Date = new Date()): ClosureWarning[] {
  const exchange = getExchangeForSymbol(symbol);
  if (exchange === "UNSUPPORTED") return [];
  const exchangeLabel = exchange === "TSX" ? "TSX (Toronto)" : "NASDAQ/NYSE";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const todayKey = `${get("year")}-${get("month")}-${get("day")}`;
  const holidays = new Set([
    ...getMarketHolidays(year, exchange), ...getMarketHolidays(year + 1, exchange),
  ]);
  const earlyCloseDays = new Set([
    ...getEarlyCloseDays(year, exchange), ...getEarlyCloseDays(year + 1, exchange),
  ]);
  const warnings: ClosureWarning[] = [];
  if (earlyCloseDays.has(todayKey) && hour * 60 + minute < 13 * 60) {
    warnings.push({ kind: "early_close_today", exchange, exchangeLabel, date: todayKey, closesAt: "13:00" });
  }
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() + 1);
  const nextKey = cursor.toISOString().slice(0, 10);
  if (holidays.has(nextKey)) warnings.push({ kind: "holiday_next_business_day", exchange, exchangeLabel, date: nextKey });
  return warnings;
}