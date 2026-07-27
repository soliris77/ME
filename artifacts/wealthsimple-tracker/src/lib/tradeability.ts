/**
 * Utilitaire de tradeabilité côté client.
 * ─────────────────────────────────────────────────────────────────────────────
 * Miroir simplifié de getExchangeForSymbol() du backend (risk.ts).
 * Permet de masquer/désactiver les boutons Acheter/Vendre côté UI sans
 * aller-retour réseau, pour des symboles que Wealthsimple ne peut pas exécuter
 * via SnapTrade : indices, futures, forex, cryptos, bourses européennes/asiatiques.
 *
 * IMPORTANT : la logique doit rester en sync avec risk.ts côté serveur.
 * Le serveur est toujours la source de vérité définitive — cette fonction
 * est uniquement là pour améliorer l'UX.
 */

export type TradeabilityExchange = "TSX" | "NASDAQ_NYSE" | "UNSUPPORTED";

export function getExchangeForSymbol(symbol: string): TradeabilityExchange {
  const upper = symbol.toUpperCase();

  // Indices boursiers (^GSPC, ^FTSE, ^N225…)
  if (upper.startsWith("^")) return "UNSUPPORTED";

  // Futures (GC=F, CL=F…) et Forex (EURUSD=X…)
  if (upper.endsWith("=F") || upper.endsWith("=X")) return "UNSUPPORTED";

  // Cryptos (-USD, -CAD, -EUR…)
  if (/-USD$|-CAD$|-EUR$|-GBP$/.test(upper)) return "UNSUPPORTED";

  // Bourses canadiennes (TSX, TSXV, NEO, CSE)
  if (/\.(TO|V|NE|CN)$/.test(upper)) return "TSX";

  // Bourses européennes
  if (/\.(DE|PA|L|SW|AS|MI|MC|BR|LS|ST|CO|OL|HE|VI|PR|WA|AT|IR|VX|AMS)$/.test(upper)) {
    return "UNSUPPORTED";
  }

  // Bourses asiatiques et Pacifique
  if (/\.(T|KS|KQ|HK|NS|BO|SS|SZ|AX|SI|KL|BK|TW|JK|NZ)$/.test(upper)) {
    return "UNSUPPORTED";
  }

  // Afrique / Moyen-Orient
  if (/\.(JO|TA)$/.test(upper)) return "UNSUPPORTED";

  // Mexique coté localement
  if (/\.MX$/.test(upper)) return "UNSUPPORTED";

  // Tout le reste est supposé US-coté (NASDAQ/NYSE/NYSE American/OTC ou ADR)
  return "NASDAQ_NYSE";
}

/**
 * Renvoie true si le symbole peut être exécuté via Wealthsimple/SnapTrade.
 * Seuls TSX et NASDAQ/NYSE sont supportés.
 */
export function isTradeableSymbol(symbol: string): boolean {
  return getExchangeForSymbol(symbol) !== "UNSUPPORTED";
}

/**
 * Message d'information à afficher quand un symbole n'est pas traitable.
 * Utilisé dans le tooltip des boutons désactivés.
 */
export function nonTradeableReason(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.startsWith("^")) return "Les indices boursiers ne peuvent pas être achetés ou vendus directement.";
  if (upper.endsWith("=F")) return "Les contrats à terme (futures) ne sont pas exécutables via Wealthsimple.";
  if (upper.endsWith("=X")) return "Les paires de devises (forex) ne sont pas exécutables via Wealthsimple.";
  if (/-USD$|-CAD$|-EUR$|-GBP$/.test(upper)) return "Les cryptomonnaies ne sont pas encore supportées par ce système de trading.";
  return `${symbol} est coté sur une bourse non supportée par Wealthsimple (seuls TSX et NASDAQ/NYSE sont disponibles).`;
}
