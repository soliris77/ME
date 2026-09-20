import { isVenueId, type PerpsVenue, type VenueId } from "@workspace/perps";
import {
  createHyperliquidVenue,
  hyperliquidCredentialsPresent,
  hyperliquidPublicAddress,
} from "./hyperliquidVenue";
import {
  GmxVenue,
  gmxCredentialsPresent,
  gmxPublicAddress,
  measureGmxExecutionFeeUsd,
} from "./gmxVenue";
import { createGmxChain } from "./gmxChain";

/**
 * Le registre des plateformes.
 *
 * Un seul endroit sait quelle plateforme se construit comment. Sans lui, le
 * service, les routes et le worker devraient chacun connaître les deux — et
 * la troisième plateforme obligerait à modifier trois fichiers au lieu d'un.
 *
 * Aucune fonction d'ici ne rend de secret : au plus un booléen de présence et
 * une adresse publique.
 */

export interface VenueAdapter {
  readonly id: VenueId;
  /** Nom affichable, en français. */
  readonly label: string;
  credentialsPresent(): boolean;
  /** Adresse publique du compte, quand elle est connue. Jamais la clé. */
  publicAddress(): string | null;
  /** La plateforme, ou `null` quand les secrets manquent. */
  create(): PerpsVenue | null;
  /**
   * Le frais fixe réellement facturé par côté, mesuré sans rien envoyer.
   * Rend `null` sur une plateforme qui n'en facture pas.
   */
  measureFixedCostUsd(): Promise<number | null>;
}

const HYPERLIQUID: VenueAdapter = {
  id: "hyperliquid",
  label: "Hyperliquid",
  credentialsPresent: () => hyperliquidCredentialsPresent(),
  publicAddress: () => hyperliquidPublicAddress(),
  create: () => createHyperliquidVenue(),
  // Carnet d'ordres centralisé : tout est proportionnel, il n'y a rien de
  // fixe à mesurer.
  measureFixedCostUsd: async () => null,
};

const GMX: VenueAdapter = {
  id: "gmx",
  label: "GMX v2 (Arbitrum)",
  credentialsPresent: () => gmxCredentialsPresent(),
  publicAddress: () => gmxPublicAddress(),
  create: () => {
    const chain = createGmxChain();
    return chain === null ? null : new GmxVenue({ chain });
  },
  measureFixedCostUsd: async () => {
    const chain = createGmxChain();
    if (chain === null) return null;
    return measureGmxExecutionFeeUsd(chain, "BTC");
  },
};

const ADAPTERS: Record<VenueId, VenueAdapter> = {
  hyperliquid: HYPERLIQUID,
  gmx: GMX,
};

export function venueAdapter(venue: string): VenueAdapter {
  if (!isVenueId(venue)) {
    throw new Error(`Plateforme inconnue : ${venue}`);
  }
  return ADAPTERS[venue];
}

/** Toutes les plateformes connues, dans l'ordre d'affichage. */
export function allVenueAdapters(): readonly VenueAdapter[] {
  return [HYPERLIQUID, GMX];
}
