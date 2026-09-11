export type TradeabilityExchange = "TSX" | "NASDAQ_NYSE" | "UNSUPPORTED";

export function getExchangeForSymbol(symbol: string): TradeabilityExchange {
  const upper = symbol.toUpperCase();
  if (upper.startsWith("^") || upper.endsWith("=F") || upper.endsWith("=X")) return "UNSUPPORTED";
  if (/-USD$|-CAD$|-EUR$|-GBP$/.test(upper)) return "UNSUPPORTED";
  if (/\.(TO|V|NE|CN)$/.test(upper)) return "TSX";
  if (/\.(DE|PA|L|SW|AS|MI|MC|BR|LS|ST|CO|OL|HE|VI|PR|WA|AT|IR|VX|AMS|T|KS|KQ|HK|NS|BO|SS|SZ|AX|SI|KL|BK|TW|JK|NZ|JO|TA|MX)$/.test(upper)) return "UNSUPPORTED";
  return "NASDAQ_NYSE";
}

export function isTradeableSymbol(symbol: string): boolean {
  return getExchangeForSymbol(symbol) !== "UNSUPPORTED";
}

export function nonTradeableReason(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.startsWith("^")) return "Les indices boursiers ne peuvent pas être achetés ou vendus directement.";
  if (upper.endsWith("=F")) return "Les contrats à terme (futures) ne sont pas exécutables via Wealthsimple.";
  if (upper.endsWith("=X")) return "Les paires de devises (forex) ne sont pas exécutables via Wealthsimple.";
  if (/-USD$|-CAD$|-EUR$|-GBP$/.test(upper)) return "Les cryptomonnaies ne sont pas encore supportées par ce système de trading.";
  return `${symbol} est coté sur une bourse non supportée par Wealthsimple (seuls TSX et NASDAQ/NYSE sont disponibles).`;
}