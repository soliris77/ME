/**
 * Accès fondateur — la clé du propriétaire de l'instance.
 * ─────────────────────────────────────────────────────────────────────────────
 * Soliris est vendu par abonnement, mais celui qui l'a écrit n'a pas à
 * s'abonner à son propre produit. Ce module lui donne une porte d'entrée, avec
 * trois garde-fous qui la distinguent d'une faille :
 *
 *  1. Elle n'existe que si FOUNDER_CODE est posé dans l'environnement. Pas de
 *     code, pas de porte — rien à deviner sur une instance client.
 *  2. Le code n'est jamais dans le bundle du navigateur, jamais dans le dépôt.
 *     Il vit dans .env.local, au même endroit que le mot de passe du site.
 *  3. L'accès obtenu est marqué comme fondateur, PAS comme abonnement payé.
 *     Les réglages affichent « Accès fondateur » : on ne se ment pas à soi-même
 *     sur l'état réel de la facturation, et la page tarifs reste testable en
 *     révoquant l'accès d'un clic.
 *
 * La comparaison est à temps constant. Une comparaison naïve fuit la longueur
 * du préfixe correct par le temps de réponse — c'est peu, mais c'est gratuit à
 * éviter.
 */
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/** Longueur minimale acceptée : sous ce seuil, on refuse d'activer la porte. */
const LONGUEUR_MINIMALE = 12;

/** Le code configuré, ou null si la fonctionnalité est désactivée. */
export function founderCode(): string | null {
  const brut = process.env.FOUNDER_CODE?.trim();
  if (!brut) return null;
  if (brut.length < LONGUEUR_MINIMALE) return null;
  return brut;
}

/** La porte fondateur est-elle configurée sur cette instance ? */
export function isFounderConfigured(): boolean {
  return founderCode() !== null;
}

/**
 * FOUNDER_CODE est posé mais trop court pour être pris au sérieux : on le
 * signale au démarrage plutôt que de laisser croire qu'il fonctionne.
 */
export function founderCodeTooShort(): boolean {
  const brut = process.env.FOUNDER_CODE?.trim();
  return Boolean(brut) && (brut as string).length < LONGUEUR_MINIMALE;
}

/** Comparaison à temps constant, tolérante aux longueurs différentes. */
export function checkFounderCode(fourni: unknown): boolean {
  const attendu = founderCode();
  if (!attendu) return false;
  if (typeof fourni !== "string" || fourni.length === 0) return false;

  const a = Buffer.from(attendu, "utf8");
  const b = Buffer.from(fourni, "utf8");
  // timingSafeEqual exige des longueurs égales : on compare des empreintes de
  // taille fixe plutôt que de court-circuiter sur la longueur.
  const pad = Buffer.alloc(Math.max(a.length, b.length));
  const aPad = Buffer.alloc(pad.length);
  const bPad = Buffer.alloc(pad.length);
  a.copy(aPad);
  b.copy(bPad);
  return timingSafeEqual(aPad, bPad) && a.length === b.length;
}

/** La session courante a-t-elle l'accès fondateur ? */
export function hasFounderAccess(req: Request): boolean {
  // Le drapeau ne vaut rien si la porte a été refermée entre-temps : on
  // revérifie que FOUNDER_CODE existe toujours. Retirer la variable de
  // .env.local et redémarrer suffit donc à révoquer toutes les sessions.
  return isFounderConfigured() && req.session?.founder === true;
}
