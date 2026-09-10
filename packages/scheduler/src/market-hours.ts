export type AssetClass = "equity" | "crypto";

/** Existing equity session semantics: weekday, 09:30–16:00 Eastern. */
export function isEquityMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday");
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return !["Sat", "Sun"].includes(weekday) && minutes >= 570 && minutes < 960;
}

export function isTradeable(assetClass: AssetClass, now: Date = new Date()): boolean {
  if (assetClass === "crypto") return true;
  return isEquityMarketOpen(now);
}