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

export function formatPercent(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatVolume(vol: number | null): string {
  if (vol === null) return "-";
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toString();
}

export function formatMarketCap(mc: number | null): string {
  if (mc === null) return "-";
  return formatVolume(mc);
}

export function changeClass(val: number): string {
  return val >= 0 ? "gain" : "loss";
}
