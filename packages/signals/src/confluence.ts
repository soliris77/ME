/**
 * La confluence : ce qu'un signal externe a le droit de faire.
 *
 * Trois politiques, du plus au moins permissif, et aucune qui permette à une
 * source d'agir seule. Même en `require_confirmation`, il faut que notre propre
 * analyse aille dans le même sens ET soit assez confiante.
 */
import type {
  ConfluenceDecision,
  ExternalSignalInput,
  OwnView,
  SignalDirection,
  SignalSource,
} from './types';

/** Confiance minimale de notre propre analyse pour confirmer un signal externe. */
export const MIN_OWN_CONFIDENCE = 0.5;

const LONG_WORDS = new Set(['buy', 'long', 'achat', 'acheter', 'entry_long', 'open_long']);
const SHORT_WORDS = new Set(['sell', 'short', 'vente', 'vendre', 'entry_short', 'open_short']);
const CLOSE_WORDS = new Set(['close', 'exit', 'flat', 'sortie', 'fermer', 'close_all']);

/** 'BUY' -> 'long'. Retourne null si l'action n'est pas comprise. */
export function normalizeAction(action: string): SignalDirection | null {
  const key = action.trim().toLowerCase();
  if (LONG_WORDS.has(key)) return 'long';
  if (SHORT_WORDS.has(key)) return 'short';
  if (CLOSE_WORDS.has(key)) return 'close';
  return null;
}

export function evaluateConfluence(
  source: SignalSource,
  signal: ExternalSignalInput,
  own: OwnView,
  now: number,
  minOwnConfidence: number = MIN_OWN_CONFIDENCE,
): ConfluenceDecision {
  const inert = (result: ConfluenceDecision['result'], reason: string): ConfluenceDecision => ({
    result, direction: null, mayTrade: false, vetoesOwnEntry: false, applied: false, reason,
  });

  if (source.mode === 'disabled') {
    return inert('source_desactivee', `source ${source.id} désactivée`);
  }

  // Un signal vieux est un signal dangereux : le marché a bougé depuis.
  if (signal.emittedAt !== undefined) {
    const ageSeconds = (now - signal.emittedAt) / 1000;
    if (ageSeconds > source.maxSignalAgeSeconds) {
      return inert('signal_perime', `signal vieux de ${Math.round(ageSeconds)} s`);
    }
  }

  const direction = normalizeAction(signal.action);
  if (!direction) {
    return inert('action_inconnue', `action « ${signal.action} » non comprise`);
  }

  // En observation, la décision est calculée jusqu'au bout puis neutralisée :
  // on veut la mesurer, pas la subir.
  const applied = source.mode === 'active';
  const finish = (
    result: ConfluenceDecision['result'],
    mayTrade: boolean,
    vetoesOwnEntry: boolean,
    reason: string,
  ): ConfluenceDecision => ({
    result,
    direction,
    mayTrade: applied && mayTrade,
    vetoesOwnEntry: applied && vetoesOwnEntry,
    applied,
    reason: applied ? reason : `${reason} (observation)`,
  });

  switch (source.confluencePolicy) {
    case 'advisory':
      return finish('consultatif', false, false, 'politique consultative');

    case 'veto_only': {
      // Un veto ne se déclenche que contre une entrée directionnelle opposée.
      const opposes =
        (direction === 'long' && own.direction === 'short') ||
        (direction === 'short' && own.direction === 'long');
      return opposes
        ? finish('veto', false, true, `signal ${direction} contre notre ${own.direction}`)
        : finish('veto_non_applicable', false, false, 'aucun conflit avec notre analyse');
    }

    case 'require_confirmation': {
      if (direction === 'close') {
        // Sortir n'ouvre aucun risque nouveau : une sortie n'a pas à être confirmée.
        return finish('confirme', true, false, 'sortie, confirmation non requise');
      }
      if (own.direction !== direction) {
        return finish('non_confirme', false, false,
          `notre analyse est ${own.direction}, le signal est ${direction}`);
      }
      if (!(own.confidence >= minOwnConfidence)) {
        return finish('non_confirme', false, false,
          `confiance propre ${own.confidence.toFixed(2)} < ${minOwnConfidence}`);
      }
      return finish('confirme', true, false,
        `confirmé par notre analyse (${own.confidence.toFixed(2)})`);
    }
  }
}
