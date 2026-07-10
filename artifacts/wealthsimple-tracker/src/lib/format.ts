export function formatPrice(price: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 1 ? 4 : 2,
  }).format(price);
}

export function formatChange(change: number, currency = "USD"): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${formatPrice(change, currency)}`;
}

export function formatPercent(pct: number | undefined | null): string {
  if (pct == null || !isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatVolume(vol: number | null | undefined): string {
  if (vol == null) return "-";
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toString();
}

export function formatMarketCap(mc: number | null | undefined): string {
  if (mc == null) return "-";
  return formatVolume(mc);
}

export function changeClass(val: number | undefined | null): string {
  if (val == null || !isFinite(val)) return "";
  return val >= 0 ? "gain" : "loss";
}

/**
 * Returns true for positive/zero change, false for negative, and null for
 * missing/non-finite values so callers can suppress directional indicators
 * (arrows, colours) when no valid data exists.
 */
export function isUp(val: number | undefined | null): boolean | null {
  if (val == null || !isFinite(val)) return null;
  return val >= 0;
}
