import { describe, it, expect } from 'vitest';
import { evaluateConfluence, normalizeAction, MIN_OWN_CONFIDENCE } from '../src/confluence';
import type { ExternalSignalInput, OwnView, SignalSource } from '../src/types';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

function source(overrides: Partial<SignalSource> = {}): SignalSource {
  return {
    id: 'tv-alerts',
    label: 'TradingView',
    mode: 'active',
    confluencePolicy: 'require_confirmation',
    maxSignalAgeSeconds: 60,
    ...overrides,
  };
}

function signal(overrides: Partial<ExternalSignalInput> = {}): ExternalSignalInput {
  return { sourceSignalId: 'abc', symbol: 'BTC-USD', action: 'buy', emittedAt: NOW, ...overrides };
}

const bullish: OwnView = { direction: 'long', confidence: 0.8 };
const bearish: OwnView = { direction: 'short', confidence: 0.8 };
const neutral: OwnView = { direction: 'neutral', confidence: 0.9 };

describe('normalizeAction', () => {
  it('comprend les synonymes en anglais et en français', () => {
    expect(normalizeAction('BUY')).toBe('long');
    expect(normalizeAction(' achat ')).toBe('long');
    expect(normalizeAction('Sell')).toBe('short');
    expect(normalizeAction('vente')).toBe('short');
    expect(normalizeAction('exit')).toBe('close');
  });

  it("retourne null sur une action qu'on ne comprend pas", () => {
    expect(normalizeAction('yolo')).toBeNull();
  });
});

describe('evaluateConfluence', () => {
  it('ignore une source désactivée', () => {
    const d = evaluateConfluence(source({ mode: 'disabled' }), signal(), bullish, NOW);
    expect(d.result).toBe('source_desactivee');
    expect(d.mayTrade).toBe(false);
    expect(d.applied).toBe(false);
  });

  it('rejette un signal plus vieux que la fenêtre de la source', () => {
    const d = evaluateConfluence(source(), signal({ emittedAt: NOW - 120_000 }), bullish, NOW);
    expect(d.result).toBe('signal_perime');
    expect(d.mayTrade).toBe(false);
  });

  it('accepte un signal sans horodatage déclaré', () => {
    const d = evaluateConfluence(source(), signal({ emittedAt: undefined }), bullish, NOW);
    expect(d.result).toBe('confirme');
  });

  it("rejette une action qu'on ne comprend pas", () => {
    const d = evaluateConfluence(source(), signal({ action: 'moon' }), bullish, NOW);
    expect(d.result).toBe('action_inconnue');
    expect(d.direction).toBeNull();
  });

  describe('require_confirmation', () => {
    it('confirme quand notre analyse va dans le même sens', () => {
      const d = evaluateConfluence(source(), signal(), bullish, NOW);
      expect(d.result).toBe('confirme');
      expect(d.mayTrade).toBe(true);
      expect(d.direction).toBe('long');
    });

    it('refuse quand notre analyse va dans le sens inverse', () => {
      const d = evaluateConfluence(source(), signal(), bearish, NOW);
      expect(d.result).toBe('non_confirme');
      expect(d.mayTrade).toBe(false);
    });

    it('refuse quand notre analyse est neutre', () => {
      const d = evaluateConfluence(source(), signal(), neutral, NOW);
      expect(d.result).toBe('non_confirme');
    });

    it('refuse quand notre confiance est trop faible', () => {
      const d = evaluateConfluence(source(), signal(), { direction: 'long', confidence: 0.3 }, NOW);
      expect(d.result).toBe('non_confirme');
      expect(d.reason).toContain('confiance propre');
    });

    it('accepte exactement au seuil de confiance', () => {
      const d = evaluateConfluence(source(), signal(), { direction: 'long', confidence: MIN_OWN_CONFIDENCE }, NOW);
      expect(d.result).toBe('confirme');
    });

    it("laisse passer une sortie sans exiger de confirmation", () => {
      const d = evaluateConfluence(source(), signal({ action: 'close' }), bearish, NOW);
      expect(d.result).toBe('confirme');
      expect(d.mayTrade).toBe(true);
      expect(d.direction).toBe('close');
    });
  });

  describe('advisory', () => {
    it("n'autorise jamais à trader, même en plein accord", () => {
      const d = evaluateConfluence(source({ confluencePolicy: 'advisory' }), signal(), bullish, NOW);
      expect(d.result).toBe('consultatif');
      expect(d.mayTrade).toBe(false);
      expect(d.vetoesOwnEntry).toBe(false);
    });
  });

  describe('veto_only', () => {
    it('bloque notre entrée quand le signal va contre elle', () => {
      const d = evaluateConfluence(source({ confluencePolicy: 'veto_only' }), signal({ action: 'sell' }), bullish, NOW);
      expect(d.result).toBe('veto');
      expect(d.vetoesOwnEntry).toBe(true);
      expect(d.mayTrade).toBe(false);
    });

    it("ne fait rien quand le signal va dans notre sens", () => {
      const d = evaluateConfluence(source({ confluencePolicy: 'veto_only' }), signal(), bullish, NOW);
      expect(d.result).toBe('veto_non_applicable');
      expect(d.vetoesOwnEntry).toBe(false);
    });

    it("ne vote jamais pour une entrée", () => {
      const d = evaluateConfluence(source({ confluencePolicy: 'veto_only' }), signal(), neutral, NOW);
      expect(d.mayTrade).toBe(false);
    });
  });

  describe('mode observation', () => {
    it('calcule la décision mais ne la laisse rien faire', () => {
      const d = evaluateConfluence(source({ mode: 'shadow' }), signal(), bullish, NOW);
      expect(d.result).toBe('confirme');
      expect(d.applied).toBe(false);
      expect(d.mayTrade).toBe(false);
      expect(d.reason).toContain('observation');
    });

    it('neutralise aussi un veto', () => {
      const d = evaluateConfluence(
        source({ mode: 'shadow', confluencePolicy: 'veto_only' }),
        signal({ action: 'sell' }), bullish, NOW);
      expect(d.result).toBe('veto');
      expect(d.vetoesOwnEntry).toBe(false);
    });
  });
});
