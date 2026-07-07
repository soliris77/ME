import { useState, useEffect } from "react";
import { X, CheckCircle, AlertCircle, ExternalLink, Activity, Database, Globe } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ApiItem {
  name: string;
  provider: string;
  status: "ok" | "error" | "checking";
  cost: string;
  note: string;
  icon: typeof Globe;
  payLink?: string;
  payLabel?: string;
}

export default function ApiStatusModal({ onClose }: { onClose: () => void }) {
  const [apiHealth, setApiHealth] = useState<"ok" | "error" | "checking">("checking");

  useEffect(() => {
    fetch(`${BASE}/api/healthz`)
      .then((r) => r.ok ? setApiHealth("ok") : setApiHealth("error"))
      .catch(() => setApiHealth("error"));
  }, []);

  const apis: ApiItem[] = [
    {
      name: "Données de marché",
      provider: "Yahoo Finance (yahoo-finance2)",
      status: apiHealth,
      cost: "Gratuit",
      note: "Scraping Yahoo Finance — aucun abonnement requis. Si les données s'arrêtent, mettre à jour le paquet.",
      icon: Activity,
      payLink: "https://rapidapi.com/apidojo/api/yahoo-finance1/",
      payLabel: "Voir l'API Yahoo Finance Pro ($)",
    },
    {
      name: "Base de données",
      provider: "PostgreSQL (Replit DB)",
      status: "ok",
      cost: "Gratuit (plan Replit)",
      note: "Stockage local pour la liste de suivi et les alertes. Inclus dans votre compte Replit.",
      icon: Database,
    },
    {
      name: "Hébergement & serveur",
      provider: "Replit",
      status: "ok",
      cost: "Inclus dans votre plan",
      note: "Le serveur tourne sur Replit. Si l'app est trop lente, envisagez un déploiement Replit payant.",
      icon: Globe,
      payLink: "https://replit.com/pricing",
      payLabel: "Voir les plans Replit ($)",
    },
  ];

  const PAID_ALTERNATIVES = [
    { name: "Polygon.io", desc: "Données temps réel pro, 5 appels/min gratuit", price: "Gratuit → 29 $/mois", url: "https://polygon.io/pricing" },
    { name: "Alpha Vantage", desc: "Actions, forex, crypto — API gratuite limitée", price: "Gratuit → 50 $/mois", url: "https://www.alphavantage.co/premium/" },
    { name: "Twelve Data", desc: "WebSocket temps réel + historique complet", price: "Gratuit → 29 $/mois", url: "https://twelvedata.com/pricing" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-card-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="font-bold text-sm">Coûts API &amp; données</div>
            <div className="text-xs text-muted-foreground">État des services et options de mise à niveau</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* API status */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Services actifs</h3>
            <div className="space-y-2">
              {apis.map((api) => {
                const Icon = api.icon;
                return (
                  <div key={api.name} className="bg-muted/30 border border-border rounded-xl p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-semibold">{api.name}</span>
                        <span className="text-xs text-muted-foreground">{api.provider}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {api.status === "checking" ? (
                          <div className="w-3 h-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
                        ) : api.status === "ok" ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        )}
                        <span className={`text-xs font-semibold ${
                          api.status === "ok" ? "text-emerald-500" :
                          api.status === "error" ? "text-red-500" : "text-muted-foreground"
                        }`}>
                          {api.status === "ok" ? "Opérationnel" : api.status === "error" ? "Erreur" : "Vérification..."}
                        </span>
                        <span className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">{api.cost}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{api.note}</p>
                    {api.payLink && (
                      <a
                        href={api.payLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {api.payLabel}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Paid upgrades */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              APIs professionnelles (optionnel)
            </h3>
            <p className="text-xs text-muted-foreground mb-2.5">
              Si vous avez besoin de données WebSocket temps réel, d'un historique illimité, ou d'une meilleure fiabilité, voici les options.
            </p>
            <div className="space-y-2">
              {PAID_ALTERNATIVES.map((alt) => (
                <div key={alt.name} className="flex items-center justify-between gap-3 bg-muted/30 border border-border rounded-xl px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{alt.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{alt.desc}</div>
                    <div className="text-xs text-primary font-medium mt-0.5">{alt.price}</div>
                  </div>
                  <a
                    href={alt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Voir <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-3">
            <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mb-1">💡 Conseil</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Yahoo Finance via yahoo-finance2 est gratuit et sans limite connue pour un usage personnel. Si l'app commence à recevoir des erreurs de rate-limit,
              vous pourrez alors passer à une API payante. Pour l'instant, aucun coût à prévoir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
