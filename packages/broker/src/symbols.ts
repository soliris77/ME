export function toBrokerSymbol(symbol: string, provider: "snaptrade" | "ccxt"): string {
  const normalized = symbol.trim().toUpperCase();
  if (provider === "ccxt") {
    const separator = normalized.lastIndexOf("-");
    if (separator > 0) {
      return `${normalized.slice(0, separator)}/${normalized.slice(separator + 1)}`;
    }
  }
  return normalized;
}

export function toInternalSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace("/", "-");
}