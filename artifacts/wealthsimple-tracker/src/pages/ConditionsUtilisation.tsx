import { Link } from "wouter";
import { usePageMeta } from "@/hooks/use-page-meta";

const SECTIONS = [
  {
    title: "1. Objet",
    body: "Soliris Market (« le Service ») propose un tableau de suivi des marchés financiers à des fins d'information générale : cours, graphiques, actualités et outils d'analyse technique. En accédant au Service, vous acceptez sans réserve les présentes conditions d'utilisation.",
  },
  {
    title: "2. Aucun conseil financier",
    body: "Le contenu affiché sur Soliris Market est fourni à titre purement informatif et pédagogique. Rien de ce qui est présenté — cours, indicateurs, alertes, journal des marchés ou contenu de la section « Apprendre » — ne constitue un conseil en investissement, une recommandation d'achat ou de vente, ni une sollicitation. Toute décision d'investissement relève de votre seule responsabilité, idéalement après consultation d'un conseiller financier agréé.",
  },
  {
    title: "3. Données de marché",
    body: "Les cours affichés peuvent être différés et proviennent de fournisseurs tiers. Soliris Market ne garantit ni l'exactitude, ni l'exhaustivité, ni la disponibilité continue de ces données. Des interruptions, retards ou écarts avec les cours réels du marché peuvent survenir à tout moment.",
  },
  {
    title: "4. Utilisation acceptable",
    body: "Vous vous engagez à utiliser le Service conformément à la loi, à ne pas tenter d'en extraire le contenu de façon automatisée à des fins commerciales, et à ne pas perturber son fonctionnement ou celui des infrastructures associées.",
  },
  {
    title: "5. Comptes et données personnelles",
    body: "Certaines fonctionnalités (portefeuille suivi, alertes, journal) peuvent reposer sur des préférences enregistrées localement dans votre navigateur. Aucune donnée financière réelle (comptes bancaires, courtage) n'est connectée ni traitée par le Service.",
  },
  {
    title: "6. Limitation de responsabilité",
    body: "Soliris Market est fourni « en l'état », sans garantie d'aucune sorte. Dans toute la mesure permise par la loi applicable, l'éditeur ne pourra être tenu responsable de pertes financières, directes ou indirectes, résultant de l'utilisation du Service ou de la confiance accordée à son contenu.",
  },
  {
    title: "7. Propriété intellectuelle",
    body: "L'identité visuelle, la marque Soliris Market, les emblèmes et l'interface sont la propriété de leurs auteurs respectifs. Toute reproduction non autorisée est interdite.",
  },
  {
    title: "8. Modifications",
    body: "Ces conditions peuvent être mises à jour à tout moment. La poursuite de l'utilisation du Service après modification vaut acceptation des nouvelles conditions.",
  },
  {
    title: "9. Contact",
    body: "Pour toute question relative à ces conditions, vous pouvez nous contacter via les canaux indiqués sur le Service.",
  },
];

export default function ConditionsUtilisation() {
  usePageMeta(
    "Conditions d'utilisation — Soliris Market",
    "Conditions d'utilisation de Soliris Market : objet du service, absence de conseil financier, données de marché et responsabilités."
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#07080a] text-[#f2ead6]">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(201,162,39,0.10), transparent 60%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/">
          <div className="flex cursor-pointer items-center gap-2.5">
            <img
              src="/lion-emblem.png"
              alt="Soliris Market"
              className="h-8 w-8 rounded-full object-cover bg-black"
            />
            <span className="brand-mark text-[13px] tracking-[0.28em] text-[#c9a227]">SOLIRIS</span>
          </div>
        </Link>
        <Link href="/dashboard">
          <button className="link-underline text-xs tracking-[0.2em] text-[#f2ead6]/70 hover:text-[#c9a227] transition-colors uppercase">
            Entrer
          </button>
        </Link>
      </header>

      <main className="reveal relative z-10 mx-auto max-w-2xl px-6 pb-24 pt-8 sm:px-10">
        <div className="text-center">
          <div className="text-[10px] tracking-[0.4em] text-[#c9a227]">SOLIRIS MARKET</div>
          <h1 className="brand-mark mt-4 text-2xl tracking-[0.1em] text-[#f2ead6] sm:text-3xl">
            CONDITIONS D'UTILISATION
          </h1>
          <div className="gold-divider mx-auto mt-6 w-24" />
          <p className="mt-6 text-xs tracking-[0.15em] text-[#f2ead6]/40">
            DERNIÈRE MISE À JOUR : 11 JUILLET 2026
          </p>
        </div>

        <div className="mt-14 space-y-10">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="brand-mark text-[13px] tracking-[0.15em] text-[#c9a227]">
                {s.title.toUpperCase()}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#f2ead6]/70">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link href="/">
            <button className="btn-sheen border border-[#c9a227]/60 px-8 py-2.5 text-[11px] tracking-[0.28em] text-[#c9a227] uppercase hover:text-[#07080a] hover:bg-[#c9a227] hover:border-[#c9a227]">
              Retour à l'accueil
            </button>
          </Link>
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-center pb-8">
        <span className="text-[10px] tracking-[0.2em] text-[#f2ead6]/35">
          SOLIRIS MARKET — DONNÉES DE MARCHÉ EN TEMPS DIFFÉRÉ
        </span>
      </footer>
    </div>
  );
}
