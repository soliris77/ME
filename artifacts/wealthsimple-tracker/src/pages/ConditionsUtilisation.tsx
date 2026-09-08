import { Link } from "wouter";
import { usePageMeta } from "@/hooks/use-page-meta";

const SECTIONS = [
  {
    title: "1. Objet du service",
    body: "Soliris Market (\u00ab le Service \u00bb) est un outil de suivi des march\u00e9s financiers, de tenue de journal et d\u2019alertes, qui permet en outre de connecter un compte de courtage et d\u2019y transmettre des ordres, manuellement ou de fa\u00e7on automatis\u00e9e. En acc\u00e9dant au Service, vous acceptez sans r\u00e9serve les pr\u00e9sentes conditions.",
  },
  {
    title: "2. Aucun conseil en investissement",
    body: "Le Service est fourni \u00e0 titre informatif et p\u00e9dagogique. Rien de ce qu\u2019il affiche \u2014 cours, indicateurs, signaux, alertes, journal ou contenu de la section \u00ab Apprendre \u00bb \u2014 ne constitue un conseil en investissement, une recommandation d\u2019achat ou de vente, ni une sollicitation. L\u2019\u00e9diteur n\u2019est pas un conseiller inscrit. Toute d\u00e9cision d\u2019investissement rel\u00e8ve de votre seule responsabilit\u00e9.",
  },
  {
    title: "3. Ex\u00e9cution d\u2019ordres et automatisation",
    body: "Le Service peut transmettre des ordres r\u00e9els \u00e0 votre compte de courtage. Deux modes existent : \u00ab paper \u00bb (simulation, mode par d\u00e9faut) et \u00ab live \u00bb (ordres r\u00e9els), ce dernier devant \u00eatre activ\u00e9 explicitement par vous. Les r\u00e8gles d\u2019automatisation agissent sans intervention de votre part, y compris en votre absence. Les garde-fous propos\u00e9s \u2014 plafond par ordre, exposition maximale, coupe-circuit de perte journali\u00e8re \u2014 sont des outils d\u2019aide et non des garanties : ils peuvent \u00eatre mis en d\u00e9faut par une panne, un retard de donn\u00e9es, un d\u00e9calage de cours ou une indisponibilit\u00e9 du courtier. Il vous appartient de surveiller vos positions et de v\u00e9rifier chaque ex\u00e9cution aupr\u00e8s de votre courtier.",
  },
  {
    title: "4. Donn\u00e9es de march\u00e9",
    body: "Les cours affich\u00e9s peuvent \u00eatre diff\u00e9r\u00e9s et proviennent de fournisseurs tiers. Le Service ne garantit ni leur exactitude, ni leur exhaustivit\u00e9, ni leur disponibilit\u00e9 continue. Des interruptions, retards ou \u00e9carts avec les cours r\u00e9els peuvent survenir \u00e0 tout moment et affecter les d\u00e9cisions prises \u00e0 partir de ces donn\u00e9es, y compris automatiquement.",
  },
  {
    title: "5. Connexion \u00e0 un courtier tiers",
    body: "La connexion \u00e0 votre compte de courtage s\u2019effectue par l\u2019interm\u00e9diaire d\u2019un prestataire tiers. Les conditions et la politique de confidentialit\u00e9 de ce prestataire et de votre courtier s\u2019appliquent en plus des pr\u00e9sentes. Le Service ne contr\u00f4le ni leur disponibilit\u00e9, ni leurs d\u00e9lais, ni leurs d\u00e9cisions : un ordre peut \u00eatre refus\u00e9, retard\u00e9, partiellement ex\u00e9cut\u00e9 ou ex\u00e9cut\u00e9 \u00e0 un cours diff\u00e9rent de celui affich\u00e9. Le relev\u00e9 de votre courtier fait foi.",
  },
  {
    title: "6. Abonnement, paiement et r\u00e9siliation",
    body: "Certaines fonctionnalit\u00e9s n\u00e9cessitent un abonnement payant, factur\u00e9 par un prestataire de paiement tiers dont les conditions s\u2019appliquent. L\u2019abonnement se renouvelle selon la p\u00e9riodicit\u00e9 indiqu\u00e9e au moment de la souscription. Vous pouvez le r\u00e9silier \u00e0 tout moment par avis \u00e9crit, sans avoir \u00e0 vous justifier. Lorsque la loi l\u2019exige, un avis vous est transmis avant tout renouvellement automatique, dans le d\u00e9lai qu\u2019elle pr\u00e9voit. Le d\u00e9tail des tarifs, de la dur\u00e9e et des frais applicables figure sur la page d\u2019abonnement et fait partie du contrat. La r\u00e9siliation prend effet \u00e0 la fin de la p\u00e9riode en cours ; l\u2019acc\u00e8s aux fonctionnalit\u00e9s r\u00e9serv\u00e9es cesse alors, vos donn\u00e9es demeurant accessibles selon l\u2019article 7. Les modalit\u00e9s de remboursement sont celles indiqu\u00e9es sur la page d\u2019abonnement et, \u00e0 d\u00e9faut, celles pr\u00e9vues par la loi applicable.",
  },
  {
    title: "7. Donn\u00e9es personnelles et financi\u00e8res",
    body: "Le Service conserve les donn\u00e9es n\u00e9cessaires \u00e0 son fonctionnement : pr\u00e9f\u00e9rences, listes de suivi, alertes, journal, historique des ordres transmis, ainsi que les identifiants techniques permettant la connexion \u00e0 votre courtier. Ces derniers sont conserv\u00e9s chiffr\u00e9s et ne sont utilis\u00e9s que pour les op\u00e9rations que vous demandez. Conform\u00e9ment \u00e0 la l\u00e9gislation qu\u00e9b\u00e9coise sur la protection des renseignements personnels, vous disposez d\u2019un droit d\u2019acc\u00e8s, de rectification et de retrait de vos renseignements, et pouvez demander la suppression de votre compte et des donn\u00e9es associ\u00e9es. Les donn\u00e9es peuvent \u00eatre h\u00e9berg\u00e9es par des prestataires situ\u00e9s hors du Qu\u00e9bec ; une \u00e9valuation des facteurs relatifs \u00e0 la vie priv\u00e9e est men\u00e9e avant toute communication de cette nature. Le responsable de la protection des renseignements personnels et ses coordonn\u00e9es sont indiqu\u00e9s sur le Service. Aucune donn\u00e9e n\u2019est vendue \u00e0 des tiers.",
  },
  {
    title: "8. S\u00e9curit\u00e9 et acc\u00e8s",
    body: "L\u2019acc\u00e8s au Service est prot\u00e9g\u00e9 par un mot de passe dont vous \u00eates seul responsable. Toute op\u00e9ration effectu\u00e9e depuis une session ouverte est r\u00e9put\u00e9e \u00eatre la v\u00f4tre. Pr\u00e9venez imm\u00e9diatement l\u2019\u00e9diteur en cas de soup\u00e7on d\u2019acc\u00e8s non autoris\u00e9, et coupez le mode \u00ab live \u00bb ainsi que les r\u00e8gles d\u2019automatisation.",
  },
  {
    title: "9. Utilisation acceptable",
    body: "Vous vous engagez \u00e0 utiliser le Service conform\u00e9ment \u00e0 la loi, \u00e0 ne pas en extraire le contenu de fa\u00e7on automatis\u00e9e \u00e0 des fins commerciales, \u00e0 ne pas contourner les limitations d\u2019acc\u00e8s ou d\u2019abonnement, et \u00e0 ne pas perturber son fonctionnement ni celui des infrastructures associ\u00e9es.",
  },
  {
    title: "10. Limitation de responsabilit\u00e9",
    body: "Le Service est fourni \u00ab en l\u2019\u00e9tat \u00bb, sans garantie de disponibilit\u00e9, d\u2019exactitude ni de r\u00e9sultat. Dans toute la mesure permise par la loi applicable, l\u2019\u00e9diteur ne saurait \u00eatre tenu responsable des pertes financi\u00e8res, directes ou indirectes, r\u00e9sultant de l\u2019utilisation du Service, d\u2019une interruption, d\u2019une erreur de donn\u00e9es, d\u2019un ordre transmis, non transmis, retard\u00e9 ou erron\u00e9, ou du comportement d\u2019une r\u00e8gle d\u2019automatisation. Aucune clause des pr\u00e9sentes n\u2019\u00e9carte les garanties et recours que la loi rend imp\u00e9ratifs au b\u00e9n\u00e9fice des consommateurs.",
  },
  {
    title: "11. Propri\u00e9t\u00e9 intellectuelle",
    body: "L\u2019identit\u00e9 visuelle, la marque Soliris Market, les embl\u00e8mes et l\u2019interface sont la propri\u00e9t\u00e9 de leurs auteurs respectifs. Toute reproduction non autoris\u00e9e est interdite.",
  },
  {
    title: "12. Droit applicable",
    body: "Les pr\u00e9sentes conditions sont r\u00e9gies par le droit applicable dans la province de Qu\u00e9bec et les lois du Canada qui y sont applicables. Les tribunaux du Qu\u00e9bec sont seuls comp\u00e9tents, sans pr\u00e9judice des r\u00e8gles imp\u00e9ratives prot\u00e9geant le consommateur dans son lieu de r\u00e9sidence.",
  },
  {
    title: "13. Modifications et contact",
    body: "Ces conditions peuvent \u00eatre mises \u00e0 jour. Toute modification substantielle vous est notifi\u00e9e \u00e0 l\u2019avance, avec son objet, son texte et sa date d\u2019entr\u00e9e en vigueur. Vous pouvez la refuser et r\u00e9silier sans frais ni p\u00e9nalit\u00e9 jusqu\u2019\u00e0 cette date. Une modification ne vous est jamais impos\u00e9e par le seul fait que vous continuez d\u2019utiliser le Service. Pour toute question, y compris l\u2019exercice de vos droits sur vos renseignements personnels, contactez l\u2019\u00e9diteur par les canaux indiqu\u00e9s sur le Service.",
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
