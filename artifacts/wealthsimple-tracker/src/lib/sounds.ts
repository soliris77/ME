/**
 * Module centralisé pour les effets sonores de Soliris Market.
 *
 * Utilise Howler.js pour la gestion du cache audio, du volume et des
 * restrictions d'autoplay navigateur (aucun son avant la première interaction).
 *
 * Sons stockés dans public/sounds/ au format WAV (< 30 Ko chacun).
 *
 * Usage :
 *   import { playSound } from "@/lib/sounds";
 *   playSound("click");
 *
 * Toggle :
 *   import { setSoundEnabled, isSoundEnabled } from "@/lib/sounds";
 */
import { Howl } from "howler";

// BASE_URL permet de fonctionner quelle que soit la config Vite (sous-dossier ou racine)
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const sounds = {
  click:        new Howl({ src: [`${BASE}/sounds/click.wav`],        volume: 0.4, preload: false }),
  success:      new Howl({ src: [`${BASE}/sounds/success.wav`],      volume: 0.5, preload: false }),
  error:        new Howl({ src: [`${BASE}/sounds/error.wav`],        volume: 0.5, preload: false }),
  notification: new Howl({ src: [`${BASE}/sounds/notification.wav`], volume: 0.6, preload: false }),
  toggle:       new Howl({ src: [`${BASE}/sounds/toggle.wav`],       volume: 0.3, preload: false }),
} as const;

export type SoundName = keyof typeof sounds;

let soundEnabled = true;

/** Joue un son si les sons sont activés. Sans effet avant la première interaction utilisateur (contrainte navigateur — Howler gère nativement). */
export function playSound(name: SoundName): void {
  if (!soundEnabled) return;
  sounds[name].play();
}

/** Active ou désactive tous les sons et persiste le choix. */
export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  localStorage.setItem("soliris-sound-enabled", String(enabled));
}

/** Retourne true si les sons sont activés. */
export function isSoundEnabled(): boolean {
  return soundEnabled;
}

/**
 * Lit la préférence stockée dans localStorage.
 * À appeler une fois au démarrage de l'app, dans le composant racine.
 * Par défaut, les sons sont activés si aucune préférence n'est enregistrée.
 */
export function initSoundPreference(): void {
  const stored = localStorage.getItem("soliris-sound-enabled");
  soundEnabled = stored === null ? true : stored === "true";
}
