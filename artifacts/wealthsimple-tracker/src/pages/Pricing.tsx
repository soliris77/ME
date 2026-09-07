import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Check,
  Zap,
  TrendingUp,
  Globe,
  Bell,
  BarChart2,
  Lock,
  Loader2,
  Star,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { usePageMeta } from "@/hooks/use-page-meta";
import { PageTransition } from "@/components/PageTransition";
import { Reveal, StaggerGroup, StaggerItem, TiltCard } from "@/components/motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const FEATURES_FREE = [
  "Tableau de bord marchés mondiaux",
  "Prix en direct (retard possible)",
  "Recherche de symboles",
  "Portefeuille suivi (5 actifs max)",
];

const FEATURES_PREMIUM = [
  "Données temps réel sans délai",
  "Portefeuille suivi illimité",
  "Alertes de prix illimitées",
  "Analyse technique avancée",
  "Accès à tous les marchés mondiaux",
  "Support prioritaire",
];

function CheckRow({ text, disabled }: { text: string; disabled?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 text-sm ${disabled ? "text-muted-foreground" : "text-foreground"}`}>
      <Check className={`w-4 h-4 shrink-0 ${disabled ? "text-muted-foreground" : "text-emerald-500"}`} />
      {text}
    </div>
  );
}

export default function Pricing() {
  usePageMeta(
    "Abonnement — Soliris Market",
    "Temps réel, alertes illimitées et analyse technique avancée. Sans engagement, annulable à tout moment.",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planPrice, setPlanPrice] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);

  useEffect(() => {
    if (searchParams.get("success") === "true") setSuccess(true);
    fetch(`${BASE}/api/whop/plans`)
      .then((response) => response.json())
      .then((data) => {
        if (data.renewalPrice) setPlanPrice(data.renewalPrice);
      })
      .catch(() => {});
  }, []);

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const redirectUrl = `${window.location.origin}${BASE}/pricing?success=true`;
      const response = await fetch(`${BASE}/api/whop/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUrl }),
      });
      if (!response.ok) throw new Error("Impossible de créer la session de paiement.");
      const { purchaseUrl } = await response.json();
      if (!purchaseUrl) throw new Error("URL de paiement manquante.");
      window.location.href = purchaseUrl;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <PageTransition className="p-6 max-w-lg mx-auto">
        <Reveal direction="scale" className="bg-card border border-emerald-500/30 elev-3 rounded-2xl p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2 tracking-tight">Paiement confirmé</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Bienvenue dans Soliris Market Premium. Votre accès est actif dès maintenant.
          </p>
          <a
            href={`${BASE}/dashboard`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground border border-primary-border btn-sheen btn-gold tr-control text-sm font-medium rounded-lg"
          >
            <TrendingUp className="w-4 h-4" />
            Accéder au tableau de bord
          </a>
          <hr className="rule-gold mt-8" />
        </Reveal>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="p-6 max-w-3xl mx-auto">
      <Link href="/">
        <button className="link-underline inline-flex items-center gap-1.5 mb-8 t-label hover:text-primary tr-control">
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour
        </button>
      </Link>

      <Reveal className="mb-10 text-center max-w-md mx-auto">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 border border-primary/25 text-primary rounded-full text-xs font-medium mb-4 gold-sweep">
          <Star className="w-3 h-3" />
          Soliris Premium
        </div>
        <h1 className="brand-serif text-4xl font-medium mb-3 tracking-tight">Choisissez votre formule</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Données de marché en temps réel, analyse technique avancée, et accès illimité
          à tous les marchés mondiaux.
        </p>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <Reveal className="bg-card border border-card-border elev-1 tr-surface rounded-2xl p-6 flex flex-col self-start">
          <div className="mb-4">
            <div className="t-label mb-1">Gratuit</div>
            <div className="text-4xl font-semibold tabular-nums tracking-tight">0 $</div>
            <div className="text-xs text-muted-foreground">Pour toujours</div>
          </div>
          <div className="space-y-2.5 mb-6">
            {FEATURES_FREE.map((feature) => <CheckRow key={feature} text={feature} />)}
          </div>
          <div className="px-4 py-2.5 text-center text-sm font-medium text-muted-foreground border border-border rounded-lg">
            Formule actuelle
          </div>
        </Reveal>

        <TiltCard intensity={0.7} className="bg-card border-2 border-primary elev-gold rounded-2xl p-6 flex flex-col relative overflow-hidden">
          <div className="absolute top-3 right-3 gold-surface text-[10px] font-semibold tracking-[0.14em] px-2.5 py-1 rounded-full z-10">
            RECOMMANDÉ
          </div>
          <div className="mb-4">
            <div className="t-label !text-primary mb-1">Premium</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tabular-nums tracking-tight">
                {planPrice !== null
                  ? `${planPrice.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
                  : "9,99 $"}
              </span>
              <span className="text-sm text-muted-foreground">/ mois</span>
            </div>
            <div className="text-xs text-muted-foreground">Facturé mensuellement · Annulez à tout moment</div>
          </div>
          <div className="space-y-2.5 flex-1 mb-6">
            {FEATURES_PREMIUM.map((feature) => <CheckRow key={feature} text={feature} />)}
          </div>
          {error && (
            <div className="mb-3 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive">
              {error}
            </div>
          )}
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary text-primary-foreground border border-primary-border btn-sheen btn-gold tr-control text-sm font-semibold rounded-lg disabled:opacity-60"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Redirection vers le paiement...</>
            ) : (
              <><Zap className="w-4 h-4" />S'abonner</>
            )}
          </button>
          <p className="text-xs text-muted-foreground text-center mt-2.5 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Mastercard, Visa, PayPal · sécurisé par Whop
          </p>
        </TiltCard>
      </div>

      <StaggerGroup speed="base" className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Globe, label: "Marchés mondiaux", desc: "US, CA, EU, JP, HK" },
          { icon: TrendingUp, label: "Temps réel", desc: "Sans délai" },
          { icon: BarChart2, label: "Analyse technique", desc: "RSI, MACD, Bollinger" },
          { icon: Bell, label: "Alertes prix", desc: "Notifications push" },
        ].map(({ icon: Icon, label, desc }) => (
          <StaggerItem key={label} className="bg-card border border-card-border elev-1 rounded-xl p-3 text-center lux-card">
            <Icon className="w-5 h-5 text-primary mx-auto mb-1.5" />
            <div className="text-xs font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <div className="mt-8 flex items-center gap-2 justify-center text-xs text-muted-foreground">
        <Lock className="w-3.5 h-3.5" />
        Paiements traités par Whop · Pas de frais cachés · Annulation facile
      </div>
      <hr className="rule-gold mt-8 mx-auto max-w-[220px]" />
    </PageTransition>
  );
}