/**
 * PremiumGate — mur de paiement.
 * ──────────────────────────────────────────────────────────────────────────
 * Enveloppe une fonctionnalité réservée aux abonnés. Trois règles de conduite,
 * apprises de ce qui rend un mur de paiement supportable plutôt qu'irritant :
 *
 *   1. On ne fait rien clignoter. Tant que l'état d'abonnement est inconnu, on
 *      affiche le contenu — jamais le mur. Montrer le mur puis le retirer une
 *      demi-seconde plus tard donne l'impression d'avoir perdu son accès.
 *   2. On montre ce qui est verrouillé. Le contenu réel reste visible derrière
 *      un voile : l'abonnement se vend beaucoup mieux quand on voit ce qu'on
 *      achète qu'avec un carré vide.
 *   3. On n'invente pas de vérité locale. `active` vient du serveur, qui le
 *      tient de Whop. Un mur qui se contourne depuis la console n'en est pas un.
 *
 * Ce composant est la façade visible du middleware `requirePremium` côté
 * serveur : lui refuse la donnée, celui-ci explique pourquoi et propose la
 * suite. Les deux doivent toujours parler du même état.
 */
import { Link } from "wouter";
import { Lock, Sparkles, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useSubscription } from "@/hooks/use-subscription";
import { Reveal } from "@/components/motion";

interface PremiumGateProps {
  children: ReactNode;
  /** Nom de la fonctionnalité, affiché tel quel : « Auto-Trader », « Copy Trading ». */
  feature: string;
  /** Une phrase sur ce que l'abonnement apporte ici, pas un argumentaire. */
  pitch?: string;
  /**
   * Laisse le contenu visible et atténué derrière le mur. Désactivez-le quand
   * ce qui est derrière n'a aucun sens à montrer (formulaire d'ordre réel).
   */
  preview?: boolean;
}

export function PremiumGate({ children, feature, pitch, preview = true }: PremiumGateProps) {
  const { subscription, isLoading } = useSubscription();

  // État inconnu : on laisse passer. Une erreur réseau de notre côté ne doit
  // pas ressembler à une perte d'abonnement.
  if (isLoading || subscription.active) {
    return (
      <>
        {subscription.inGrace && <GraceBanner />}
        {children}
      </>
    );
  }

  return (
    <div className="relative">
      {preview && (
        <div
          aria-hidden="true"
          className="pointer-events-none select-none opacity-25 blur-[3px] saturate-50"
        >
          {children}
        </div>
      )}

      <div
        className={
          preview
            ? "absolute inset-0 flex items-start justify-center pt-16 px-4"
            : "flex items-start justify-center pt-8 px-4"
        }
      >
        <Reveal direction="scale" className="w-full max-w-md">
          <div className="surface-glass rounded-2xl p-8 text-center elev-3">
            <div className="w-12 h-12 rounded-full border border-primary/30 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-5 h-5 text-primary" />
            </div>

            <div className="t-micro mb-3">Réservé aux abonnés</div>
            <h2 className="text-lg font-semibold tracking-tight mb-2">{feature}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-[46ch] mx-auto">
              {pitch ?? "Cette fonctionnalité fait partie de Soliris Premium."}
            </p>

            <Link href="/tarifs">
              <button className="btn-sheen btn-gold tr-control inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground border border-primary-border text-sm font-semibold">
                <Sparkles className="w-4 h-4" />
                Voir l'abonnement
              </button>
            </Link>

            <hr className="rule-gold mt-7" />
            <p className="text-xs text-muted-foreground mt-4">
              Sans engagement · Annulable à tout moment
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/**
 * Paiement en échec, accès encore ouvert. On prévient sans couper : couper
 * l'accès sur un premier prélèvement refusé fait perdre des abonnés qui
 * seraient simplement restés en changeant de carte.
 */
function GraceBanner() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-medium text-amber-500">Votre dernier paiement n'est pas passé</div>
        <p className="text-muted-foreground text-xs mt-0.5">
          Votre accès reste ouvert pour le moment.{" "}
          <Link href="/tarifs">
            <span className="link-underline cursor-pointer text-primary">Mettre à jour le paiement</span>
          </Link>
        </p>
      </div>
    </div>
  );
}
