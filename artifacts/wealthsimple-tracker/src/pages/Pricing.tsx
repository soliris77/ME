import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Check, Zap, TrendingUp, Globe, Bell, BarChart2, Lock, Loader2, Star } from "lucide-react";

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
  const [location] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planPrice, setPlanPrice] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setSuccess(true);
    }
    // Fetch plan info
    fetch(`${BASE}/api/whop/plans`)
      .then((r) => r.json())
      .then((d) => { if (d.renewalPrice) setPlanPrice(d.renewalPrice); })
      .catch(() => {});
  }, []);

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const redirectUrl = `${window.location.origin}${BASE}/pricing?success=true`;
      const resp = await fetch(`${BASE}/api/whop/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUrl }),
      });
      if (!resp.ok) throw new Error("Impossible de créer la session de paiement.");
      const { purchaseUrl } = await resp.json();
      if (!purchaseUrl) throw new Error("URL de paiement manquante.");
      window.location.href = purchaseUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="p-6 max-w-lg">
        <div className="bg-card border border-emerald-500/30 rounded-2xl p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold mb-2">Paiement réussi ! 🎉</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Bienvenue dans WS Marchés Premium. Votre accès est maintenant actif.
          </p>
          <a
            href={`${BASE}/`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <TrendingUp className="w-4 h-4" />
            Accéder au tableau de bord
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-8 text-center max-w-md mx-auto">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold mb-3">
          <Star className="w-3 h-3" />
          Débloquez tout le potentiel de l'app
        </div>
        <h1 className="text-2xl font-bold mb-2">Choisissez votre formule</h1>
        <p className="text-sm text-muted-foreground">
          Données de marché en temps réel, analyse technique avancée, et accès illimité à tous les marchés mondiaux.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        {/* Gratuit */}
        <div className="bg-card border border-card-border rounded-2xl p-6 flex flex-col">
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Gratuit</div>
            <div className="text-3xl font-bold">0 $</div>
            <div className="text-xs text-muted-foreground">Pour toujours</div>
          </div>
          <div className="space-y-2.5 flex-1 mb-6">
            {FEATURES_FREE.map((f) => <CheckRow key={f} text={f} />)}
          </div>
          <div className="px-4 py-2.5 text-center text-sm font-medium text-muted-foreground border border-border rounded-lg">
            Formule actuelle
          </div>
        </div>

        {/* Premium */}
        <div className="bg-card border-2 border-primary rounded-2xl p-6 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">
            RECOMMANDÉ
          </div>
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Premium</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">{planPrice !== null ? `${planPrice.toFixed(2)} $` : "9,99 $"}</span>
              <span className="text-sm text-muted-foreground">/ mois</span>
            </div>
            <div className="text-xs text-muted-foreground">Facturé mensuellement · Annulez à tout moment</div>
          </div>
          <div className="space-y-2.5 flex-1 mb-6">
            {FEATURES_PREMIUM.map((f) => <CheckRow key={f} text={f} />)}
          </div>

          {error && (
            <div className="mb-3 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Redirection vers le paiement...</>
            ) : (
              <><Zap className="w-4 h-4" />S'abonner maintenant — Mastercard, Visa, PayPal</>
            )}
          </button>
          <p className="text-xs text-muted-foreground text-center mt-2.5">
            🔒 Paiement sécurisé par Whop · SSL
          </p>
        </div>
      </div>

      {/* Features highlights */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Globe, label: "Marchés mondiaux", desc: "US, CA, EU, JP, HK" },
          { icon: TrendingUp, label: "Temps réel", desc: "Sans délai" },
          { icon: BarChart2, label: "Analyse technique", desc: "RSI, MACD, Bollinger" },
          { icon: Bell, label: "Alertes prix", desc: "Notifications push" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-3 text-center">
            <Icon className="w-5 h-5 text-primary mx-auto mb-1.5" />
            <div className="text-xs font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2 justify-center text-xs text-muted-foreground">
        <Lock className="w-3.5 h-3.5" />
        Paiements traités par Whop · Pas de frais cachés · Annulation facile
      </div>
    </div>
  );
}
