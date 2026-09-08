/**
 * useSubscription — l'état d'abonnement, tel que le serveur le connaît.
 * ──────────────────────────────────────────────────────────────────────────
 * Le frontend ne calcule jamais s'il est premium : il le demande. La réponse
 * vient de /api/subscription, qui la tient de Whop et de la base. Rien ici ne
 * doit être déduit d'une valeur locale — sinon le mur de paiement se contourne
 * depuis la console du navigateur.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface SubscriptionState {
  /** Seul champ à consulter pour ouvrir ou fermer une fonctionnalité. */
  active: boolean;
  /** Statut brut Whop : active, trialing, past_due, canceled, expired, none… */
  status: string;
  /** Paiement en échec mais accès encore ouvert — à signaler sans bloquer. */
  inGrace: boolean;
  planId: string | null;
  membershipId: string | null;
  currentPeriodEnd: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  /** L'accès vient de la clé fondateur, pas d'un paiement encaissé. */
  founder: boolean;
  /** Une clé fondateur est configurée sur cette instance (réglages seulement). */
  founderAvailable?: boolean;
}

const UNKNOWN: SubscriptionState = {
  active: false,
  status: "unknown",
  inGrace: false,
  planId: null,
  membershipId: null,
  currentPeriodEnd: null,
  lastCheckedAt: null,
  lastError: null,
  founder: false,
};

export function useSubscription() {
  const q = useQuery<SubscriptionState>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/subscription`);
      if (!r.ok) throw new Error("Impossible de lire l'état d'abonnement.");
      return r.json();
    },
    // L'abonnement bouge rarement, et le serveur a déjà son propre cache de
    // cinq minutes face à Whop : inutile de le redemander à chaque montage.
    staleTime: 60_000,
    retry: 1,
  });

  return {
    subscription: q.data ?? UNKNOWN,
    /** true tant qu'on ne sait pas — évite de faire clignoter le mur de paiement. */
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Synchronisation immédiate avec Whop. À appeler au retour du paiement :
 * sans elle, l'abonné qui vient de payer attendrait l'expiration du cache
 * serveur avant de voir son accès s'ouvrir.
 */
export function useRefreshSubscription() {
  const qc = useQueryClient();

  return useMutation<SubscriptionState, Error, void>({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/subscription/refresh`, { method: "POST" });
      if (!r.ok) throw new Error("Synchronisation impossible pour le moment.");
      return r.json();
    },
    onSuccess: (state) => {
      qc.setQueryData(["subscription"], state);
    },
  });
}

/**
 * Ouvre l'accès fondateur pour la session courante.
 * Le code part au serveur et n'est jamais conservé côté navigateur : ce qui
 * ouvre l'accès est le drapeau posé dans la session, pas une valeur locale
 * qu'on pourrait remettre depuis la console.
 */
export function useGrantFounder() {
  const qc = useQueryClient();

  return useMutation<{ founder: boolean }, Error, string>({
    mutationFn: async (code) => {
      const r = await fetch(`${BASE}/api/subscription/founder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        throw new Error(detail.error ?? "Clé refusée.");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}

/**
 * Referme l'accès fondateur. C'est ce qui permet de voir le site tel que le
 * verra un client payant — sans toucher à la configuration.
 */
export function useRevokeFounder() {
  const qc = useQueryClient();

  return useMutation<{ founder: boolean }, Error, void>({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/subscription/founder`, { method: "DELETE" });
      if (!r.ok) throw new Error("Impossible de refermer l'accès fondateur.");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}

/** Libellé lisible pour un statut Whop. */
export function subscriptionLabel(status: string): string {
  switch (status) {
    case "active":
      return "Actif";
    case "trialing":
      return "Période d'essai";
    case "completed":
      return "Accès à vie";
    case "past_due":
      return "Paiement en retard";
    case "unpaid":
      return "Impayé";
    case "canceled":
      return "Résilié";
    case "expired":
      return "Expiré";
    case "none":
      return "Aucun abonnement";
    default:
      return "Indéterminé";
  }
}
