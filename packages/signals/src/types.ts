/**
 * Lot 8 — sources de signaux externes.
 *
 * Principe : un signal externe n'est jamais un ordre. C'est une entrée de plus
 * dans le moteur Soliris, qui passe par la confluence avec notre propre analyse
 * puis par le RiskGate comme tout le reste. Aucune clé Kraken ne sort d'ici.
 */

export type SourceMode = 'shadow' | 'active' | 'disabled';

export type ConfluencePolicy =
  /** Le signal ne peut agir que si notre propre analyse va dans le même sens. */
  | 'require_confirmation'
  /** Le signal est enregistré et mesuré, mais n'agit jamais. */
  | 'advisory'
  /** Le signal ne peut que bloquer une entrée, jamais en déclencher une. */
  | 'veto_only';

export interface SignalSource {
  id: string;
  label: string;
  mode: SourceMode;
  confluencePolicy: ConfluencePolicy;
  maxSignalAgeSeconds: number;
}

export type SignalDirection = 'long' | 'short' | 'close';

export interface ExternalSignalInput {
  sourceSignalId: string;
  symbol: string;
  action: string;
  /** Horodatage d'émission déclaré par la source (epoch ms), si fourni. */
  emittedAt?: number;
  referencePrice?: number;
}

/** Notre propre lecture du marché, telle que la produit analyzeSignal. */
export interface OwnView {
  direction: 'long' | 'short' | 'neutral';
  confidence: number;   // 0..1
}

export type ConfluenceResult =
  | 'source_desactivee'
  | 'signal_perime'
  | 'action_inconnue'
  | 'confirme'
  | 'non_confirme'
  | 'consultatif'
  | 'veto'
  | 'veto_non_applicable';

export interface ConfluenceDecision {
  result: ConfluenceResult;
  direction: SignalDirection | null;
  /** Vrai seulement si ce signal peut ouvrir une position. */
  mayTrade: boolean;
  /** Vrai si ce signal doit empêcher notre propre entrée. */
  vetoesOwnEntry: boolean;
  /**
   * Faux quand la source est en observation : la décision est calculée et
   * enregistrée, mais ne touche rien. C'est ce qui permet de mesurer une
   * source pendant deux semaines avant de lui donner le moindre pouvoir.
   */
  applied: boolean;
  reason: string;
}
