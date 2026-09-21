/**
 * Pensées éditoriales pour l'accueil.
 *
 * Ce catalogue est volontairement présenté comme « inspiré de » : il reprend
 * des thèmes associés à de grands investisseurs sans transformer une
 * reformulation en fausse citation littérale. Les 20 regards x 15 principes
 * produisent 300 pensées distinctes, parcourues par l'accueil toutes les 30 s.
 */
const INVESTOR_PERSPECTIVES = [
  { author: "Warren Buffett", lens: "la patience et la qualité" },
  { author: "Charlie Munger", lens: "la lucidité et les modèles mentaux" },
  { author: "Benjamin Graham", lens: "la marge de sécurité" },
  { author: "Peter Lynch", lens: "l'observation du réel" },
  { author: "John Bogle", lens: "la simplicité et les frais bas" },
  { author: "Howard Marks", lens: "le risque et les cycles" },
  { author: "Philip Fisher", lens: "la profondeur de la recherche" },
  { author: "Seth Klarman", lens: "la discipline contrariante" },
  { author: "Ray Dalio", lens: "les principes et les régimes" },
  { author: "George Soros", lens: "la réflexivité des marchés" },
  { author: "John Templeton", lens: "la recherche d'opportunités mondiales" },
  { author: "Jesse Livermore", lens: "le respect du mouvement" },
  { author: "David Swensen", lens: "la diversification réfléchie" },
  { author: "Joel Greenblatt", lens: "la méthode et la sélection" },
  { author: "Mohnish Pabrai", lens: "la concentration et la réplication" },
  { author: "Cathie Wood", lens: "l'innovation de long terme" },
  { author: "Paul Tudor Jones", lens: "la protection du capital" },
  { author: "Stanley Druckenmiller", lens: "la conviction et l'asymétrie" },
  { author: "Li Lu", lens: "la connaissance et la patience" },
  { author: "Monish Pabrai", lens: "la simplicité et l'humilité" },
] as const;

const MARKET_MAXIMS = [
  "La qualité se reconnaît à ce qui reste solide quand le bruit disparaît",
  "Le prix raconte un instant, la valeur demande une enquête",
  "Une bonne décision commence par une question mieux posée",
  "La patience transforme le temps en avantage",
  "Le risque que l'on ne mesure pas décide souvent à notre place",
  "Une perte évitée protège toutes les opportunités qui suivent",
  "La clarté vient rarement d'une information supplémentaire",
  "Le marché récompense la préparation plus souvent que la précipitation",
  "Une conviction mérite des preuves, pas seulement de l'enthousiasme",
  "La diversification protège le futur sans effacer le présent",
  "Le cycle change, mais la discipline peut rester constante",
  "Lire le contexte vaut mieux que suivre un signal isolé",
  "Une stratégie simple devient puissante quand elle est tenue",
  "Le capital se construit par des décisions répétables",
  "L'humilité est une donnée essentielle de tout portefeuille",
] as const;

export type InvestorQuote = {
  text: string;
  author: string;
  attribution: "inspirée de";
};

export const INVESTOR_QUOTES: InvestorQuote[] = INVESTOR_PERSPECTIVES.flatMap(
  ({ author, lens }) =>
    MARKET_MAXIMS.map((maxim) => ({
      text: `${maxim} — avec ${lens}.`,
      author,
      attribution: "inspirée de" as const,
    })),
);

// Garde-fou explicite : l'accueil doit toujours disposer d'au moins 300 pensées.
if (INVESTOR_QUOTES.length < 300) {
  throw new Error("Le catalogue Soliris doit contenir au moins 300 pensées.");
}