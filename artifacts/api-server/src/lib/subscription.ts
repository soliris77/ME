/**
 * Abonnement — vérité serveur, jamais client.
 * ─────────────────────────────────────────────────────────────────────────────
 * Le frontend ne décide pas s'il est premium : il demande, on répond. La
 * réponse vient de la table `subscription`, rafraîchie depuis Whop au plus une
 * fois toutes les cinq minutes (ou immédiatement sur demande explicite, par
 * exemple au retour du paiement).
 *
 * Pourquoi ne pas interroger Whop à chaque requête : leur API est distante et
 * peut être lente ou indisponible. Une panne Whop couperait alors l'accès de
 * quelqu'un qui a payé. Ici, la dernière vérité connue reste valable ; en cas
 * d'échec de synchronisation on conserve l'état précédent et on note l'erreur
 * pour l'afficher dans les réglages.
 *
 * Mono-utilisateur pour l'instant : une seule ligne, `subject_id = "owner"`.
 * Toutes les fonctions prennent déjà un sujet, donc le passage multi-comptes
 * consistera à passer l'identifiant d'utilisateur au lieu de la constante.
 */
import { db, subscriptionTable, type Subscription } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { getWhopClient } from "../whopClient";
import { hasFounderAccess } from "./founder";
import { logger } from "./logger";

/** Sujet unique tant que l'application est mono-utilisateur. */
export const OWNER_SUBJECT = "owner";

/** Fenêtre pendant laquelle on fait confiance à l'état déjà en base. */
const SUBSCRIPTION_TTL_MS = 5 * 60 * 1000;

const PLAN_ID = process.env.WHOP_PLAN_ID ?? "plan_JrkAsnIXuyaK6";
const PRODUCT_ID = process.env.WHOP_PRODUCT_ID ?? "prod_Vm5BtK32mmOY2";

/**
 * Statuts qui ouvrent l'accès. `completed` couvre les achats à vie, `trialing`
 * la période d'essai. Tout le reste est fermé, à l'exception des statuts
 * d'avertissement traités plus bas.
 */
const OPEN_STATUSES = new Set(["active", "trialing", "completed"]);
/** Paiement en retard : on avertit, mais on laisse la porte ouverte. */
const GRACE_STATUSES = new Set(["past_due", "unpaid"]);

export interface SubscriptionState {
  /** L'accès premium est-il ouvert ? Seul champ que l'interface doit consulter. */
  active: boolean;
  status: string;
  /** true quand le paiement a échoué mais que l'accès reste ouvert. */
  inGrace: boolean;
  planId: string | null;
  membershipId: string | null;
  currentPeriodEnd: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  /**
   * L'accès vient de la clé fondateur, pas d'un paiement. Volontairement
   * distinct de `active` : l'interface doit pouvoir le dire, et le propriétaire
   * doit pouvoir voir l'état réel de sa facturation derrière.
   */
  founder: boolean;
}

function toState(row: Subscription): SubscriptionState {
  return {
    active: row.active,
    status: row.status,
    inGrace: GRACE_STATUSES.has(row.status) && row.active,
    planId: row.planId,
    membershipId: row.membershipId,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastError: row.lastError,
    founder: false,
  };
}

/**
 * Superpose l'accès fondateur à l'état réel. `status` n'est PAS réécrit : on
 * garde le statut Whop tel quel pour que les réglages montrent la vérité de la
 * facturation sous la mention « Accès fondateur ».
 */
export function withFounder(state: SubscriptionState, founder: boolean): SubscriptionState {
  if (!founder) return state;
  return { ...state, active: true, founder: true };
}

/**
 * État tel qu'il s'applique à CETTE requête — c'est-à-dire en tenant compte de
 * la session, seul endroit où vit l'accès fondateur.
 */
export async function getSubscriptionForRequest(
  req: Request,
  subjectId = OWNER_SUBJECT,
): Promise<SubscriptionState> {
  const state = await getSubscription(subjectId);
  return withFounder(state, hasFounderAccess(req));
}

async function ensureRow(subjectId: string): Promise<Subscription> {
  const [existing] = await db
    .select()
    .from(subscriptionTable)
    .where(eq(subscriptionTable.subjectId, subjectId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(subscriptionTable)
    .values({ subjectId, status: "none", active: false })
    .onConflictDoNothing({ target: subscriptionTable.subjectId })
    .returning();
  if (created) return created;

  // Course avec une autre requête : la ligne vient d'être créée à côté.
  const [row] = await db
    .select()
    .from(subscriptionTable)
    .where(eq(subscriptionTable.subjectId, subjectId))
    .limit(1);
  return row;
}

/** Extrait la fin de période, quel que soit le nom de champ renvoyé par Whop. */
function readPeriodEnd(m: Record<string, unknown>): Date | null {
  const candidates = [m.renewal_period_end, m.expires_at, m.valid_until, m.current_period_end];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) {
      // Whop renvoie des secondes Unix sur la plupart des champs de date.
      return new Date(c < 1e12 ? c * 1000 : c);
    }
    if (typeof c === "string" && c) {
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/**
 * Retrouve l'adhésion courante auprès de Whop.
 * Deux chemins : par identifiant si on en connaît déjà un, sinon en listant
 * les adhésions du plan. Le SDK n'est pas typé finement côté projet — d'où les
 * accès souples, encadrés par des vérifications explicites.
 */
async function fetchMembership(knownId: string | null): Promise<Record<string, unknown> | null> {
  const client = await getWhopClient();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const api = client as any;

  if (knownId) {
    const m = await api.memberships.retrieve(knownId);
    if (m) return m as Record<string, unknown>;
  }

  // Pas d'identifiant connu : on demande à Whop les adhésions du plan et on
  // retient la première valide. C'est ce chemin qui sert au retour de paiement,
  // sans jamais faire confiance à un identifiant venu du navigateur.
  const list = await api.memberships.list({ plan_id: PLAN_ID, valid: true });
  const items: unknown[] = Array.isArray(list) ? list : (list?.data ?? list?.items ?? []);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const valid = items.find((raw) => {
    const m = raw as Record<string, unknown>;
    const status = String(m.status ?? "");
    return m.valid === true || OPEN_STATUSES.has(status);
  });
  return (valid as Record<string, unknown>) ?? null;
}

/**
 * Interroge Whop et met la base à jour. En cas d'échec, l'état précédent est
 * conservé : une panne chez le fournisseur de paiement ne doit jamais fermer
 * l'accès de quelqu'un qui a payé.
 */
export async function refreshSubscription(subjectId = OWNER_SUBJECT): Promise<SubscriptionState> {
  const row = await ensureRow(subjectId);

  try {
    const membership = await fetchMembership(row.membershipId);

    if (!membership) {
      const [updated] = await db
        .update(subscriptionTable)
        .set({
          status: "none",
          active: false,
          lastCheckedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionTable.subjectId, subjectId))
        .returning();
      return toState(updated);
    }

    const status = String(membership.status ?? (membership.valid ? "active" : "none"));
    const productId =
      (membership.product as Record<string, unknown> | undefined)?.id ?? membership.product_id ?? null;

    // Le produit doit correspondre : une adhésion à un autre produit du même
    // compte Whop ne doit pas ouvrir Soliris.
    const productMatches = !productId || productId === PRODUCT_ID;
    const active = productMatches && (OPEN_STATUSES.has(status) || GRACE_STATUSES.has(status));

    const [updated] = await db
      .update(subscriptionTable)
      .set({
        membershipId: String(membership.id ?? row.membershipId ?? "") || null,
        planId: PLAN_ID,
        productId: productId ? String(productId) : null,
        status,
        active,
        currentPeriodEnd: readPeriodEnd(membership),
        lastCheckedAt: new Date(),
        lastError: null,
        raw: membership,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionTable.subjectId, subjectId))
      .returning();

    return toState(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    logger.error({ err }, "subscription: échec de la synchronisation Whop");

    const [updated] = await db
      .update(subscriptionTable)
      .set({ lastCheckedAt: new Date(), lastError: message, updatedAt: new Date() })
      .where(eq(subscriptionTable.subjectId, subjectId))
      .returning();

    // L'état conservé est celui d'avant : on n'a rien appris, on ne coupe rien.
    return toState(updated);
  }
}

/**
 * État courant. Rafraîchit depuis Whop si la dernière vérification date de
 * plus de cinq minutes, sinon répond depuis la base.
 */
export async function getSubscription(
  subjectId = OWNER_SUBJECT,
  { force = false }: { force?: boolean } = {},
): Promise<SubscriptionState> {
  const row = await ensureRow(subjectId);
  const age = row.lastCheckedAt ? Date.now() - row.lastCheckedAt.getTime() : Infinity;

  if (force || age > SUBSCRIPTION_TTL_MS) {
    return refreshSubscription(subjectId);
  }
  return toState(row);
}

/** Raccourci de lecture pour le code métier. */
export async function isPremium(subjectId = OWNER_SUBJECT): Promise<boolean> {
  const state = await getSubscription(subjectId);
  return state.active;
}

/**
 * Middleware Express — ferme une route aux non-abonnés.
 * Répond 402 (« Payment Required ») plutôt que 403 : le client sait ainsi
 * qu'il doit proposer l'abonnement, pas signaler une erreur de droits.
 *
 * Le verrou est VOLONTAIREMENT opt-in : il ne ferme rien tant que
 * PREMIUM_ENFORCED=true n'est pas posé dans l'environnement. Activer la
 * fermeture par défaut couperait l'accès du propriétaire de l'instance à ses
 * propres fonctions dès le déploiement de ce code, avant même qu'une adhésion
 * Whop soit rattachée. En attendant, chaque refus qui *aurait* eu lieu est
 * journalisé : on peut donc mesurer l'effet du mur avant de l'ériger.
 */
export async function requirePremium(req: Request, res: Response, next: NextFunction) {
  const enforced = process.env.PREMIUM_ENFORCED === "true";

  // La clé du propriétaire passe avant tout appel réseau : pas de dépendance à
  // Whop pour que celui qui a écrit le logiciel puisse s'en servir.
  if (hasFounderAccess(req)) {
    return next();
  }

  try {
    const state = await getSubscription();
    if (state.active || !enforced) {
      if (!state.active) {
        logger.info(
          { path: req.path, status: state.status },
          "subscription: accès premium laissé ouvert (PREMIUM_ENFORCED non activé)",
        );
      }
      return next();
    }
    return res.status(402).json({
      error: "Cette fonctionnalité nécessite un abonnement Soliris Premium.",
      code: "subscription_required",
      status: state.status,
    });
  } catch (err) {
    logger.error({ err }, "subscription: vérification impossible");
    // Indisponibilité de notre côté : on laisse passer plutôt que de bloquer
    // un abonné légitime sur une panne interne.
    return next();
  }
}
