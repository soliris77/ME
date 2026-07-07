// Shared content for the "Apprendre à trader" section. Extracted out of
// Learn.tsx so both the tabbed overview page AND the individual detail pages
// (one URL per term/pattern, for SEO) can reuse the same data without
// duplication.

export interface Candle {
  slug: string;
  name: string;
  signal: "haussier" | "baissier" | "neutre";
  description: string;
  howToUse: string;
  svg: string;
}

export const CANDLES: Candle[] = [
  {
    slug: "marteau-hammer",
    name: "Marteau (Hammer)",
    signal: "haussier",
    description: "Petite bougie verte avec une très longue mèche inférieure. Signale que les vendeurs ont essayé de pousser le prix vers le bas, mais les acheteurs ont repris le contrôle.",
    howToUse: "Cherchez ce pattern au bas d'une tendance baissière. Si la bougie suivante est également verte, c'est un signal de retournement fort.",
    svg: `<svg viewBox="0 0 40 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="65" x2="20" y2="15" stroke="#22c55e" stroke-width="1.5"/>
      <rect x="13" y="35" width="14" height="10" rx="1" fill="#22c55e"/>
    </svg>`,
  },
  {
    slug: "etoile-filante-shooting-star",
    name: "Étoile filante (Shooting Star)",
    signal: "baissier",
    description: "Petite bougie rouge avec une très longue mèche supérieure. Signale que les acheteurs ont essayé de monter le prix, mais les vendeurs ont repris le contrôle.",
    howToUse: "Cherchez ce pattern au sommet d'une tendance haussière. C'est souvent le signal d'un retournement vers le bas. Confirmez avec le volume.",
    svg: `<svg viewBox="0 0 40 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="10" x2="20" y2="65" stroke="#ef4444" stroke-width="1.5"/>
      <rect x="13" y="35" width="14" height="10" rx="1" fill="#ef4444"/>
    </svg>`,
  },
  {
    slug: "doji",
    name: "Doji",
    signal: "neutre",
    description: "Bougie dont l'ouverture et la clôture sont presque identiques — forme une croix. Signale une indécision totale entre acheteurs et vendeurs.",
    howToUse: "Un Doji seul ne donne pas de direction. Mais après une longue tendance, c'est souvent le signe qu'un retournement se prépare. Attendez la bougie suivante pour confirmer.",
    svg: `<svg viewBox="0 0 40 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="10" x2="20" y2="70" stroke="#94a3b8" stroke-width="1.5"/>
      <rect x="10" y="38" width="20" height="4" rx="1" fill="#94a3b8"/>
    </svg>`,
  },
  {
    slug: "engulfing-haussier",
    name: "Engulfing haussier",
    signal: "haussier",
    description: "Une grande bougie verte qui 'engloutit' entièrement la bougie rouge précédente. Signale que les acheteurs ont complètement dominé les vendeurs sur cette période.",
    howToUse: "Très fiable au bas d'une tendance baissière. Plus la bougie verte est grande par rapport à la rouge, plus le signal est fort.",
    svg: `<svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="28" width="16" height="18" rx="1" fill="#ef4444"/>
      <rect x="32" y="22" width="18" height="30" rx="1" fill="#22c55e"/>
      <line x1="41" y1="16" x2="41" y2="22" stroke="#22c55e" stroke-width="1.5"/>
      <line x1="41" y1="52" x2="41" y2="58" stroke="#22c55e" stroke-width="1.5"/>
    </svg>`,
  },
  {
    slug: "engulfing-baissier",
    name: "Engulfing baissier",
    signal: "baissier",
    description: "Une grande bougie rouge qui engloutit la bougie verte précédente. Les vendeurs prennent complètement le contrôle après une montée.",
    howToUse: "Très efficace au sommet d'une tendance haussière. Utilisez-le pour sortir d'une position longue ou envisager une vente.",
    svg: `<svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="28" width="16" height="18" rx="1" fill="#22c55e"/>
      <rect x="32" y="22" width="18" height="30" rx="1" fill="#ef4444"/>
      <line x1="41" y1="16" x2="41" y2="22" stroke="#ef4444" stroke-width="1.5"/>
      <line x1="41" y1="52" x2="41" y2="58" stroke="#ef4444" stroke-width="1.5"/>
    </svg>`,
  },
  {
    slug: "etoile-du-matin-morning-star",
    name: "Étoile du matin (Morning Star)",
    signal: "haussier",
    description: "Séquence de 3 bougies : rouge, petite (Doji ou petite bougie), puis grande verte. Signale la fin d'une baisse et le début d'une hausse.",
    howToUse: "L'un des patterns les plus fiables. La 3e bougie verte doit clôturer au-dessus du milieu de la 1re bougie rouge pour confirmer.",
    svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="20" width="16" height="25" rx="1" fill="#ef4444"/>
      <rect x="30" y="42" width="12" height="6" rx="1" fill="#94a3b8"/>
      <line x1="36" y1="36" x2="36" y2="42" stroke="#94a3b8" stroke-width="1.5"/>
      <line x1="36" y1="48" x2="36" y2="54" stroke="#94a3b8" stroke-width="1.5"/>
      <rect x="56" y="22" width="18" height="28" rx="1" fill="#22c55e"/>
      <line x1="65" y1="16" x2="65" y2="22" stroke="#22c55e" stroke-width="1.5"/>
      <line x1="65" y1="50" x2="65" y2="56" stroke="#22c55e" stroke-width="1.5"/>
    </svg>`,
  },
  {
    slug: "etoile-du-soir-evening-star",
    name: "Étoile du soir (Evening Star)",
    signal: "baissier",
    description: "Séquence de 3 bougies : verte, petite, puis grande rouge. L'inverse de l'étoile du matin — signale la fin d'une hausse.",
    howToUse: "Cherchez ce pattern au sommet d'une tendance. Combiné avec un RSI > 70, c'est un signal de vente très fort.",
    svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="30" width="16" height="25" rx="1" fill="#22c55e"/>
      <rect x="30" y="24" width="12" height="6" rx="1" fill="#94a3b8"/>
      <line x1="36" y1="18" x2="36" y2="24" stroke="#94a3b8" stroke-width="1.5"/>
      <line x1="36" y1="30" x2="36" y2="36" stroke="#94a3b8" stroke-width="1.5"/>
      <rect x="56" y="25" width="18" height="28" rx="1" fill="#ef4444"/>
      <line x1="65" y1="18" x2="65" y2="25" stroke="#ef4444" stroke-width="1.5"/>
      <line x1="65" y1="53" x2="65" y2="60" stroke="#ef4444" stroke-width="1.5"/>
    </svg>`,
  },
  {
    slug: "trois-soldats-blancs",
    name: "Trois soldats blancs",
    signal: "haussier",
    description: "Trois bougies vertes consécutives avec des corps larges et des mèches courtes. Signale une forte pression acheteuse et le début d'une tendance haussière.",
    howToUse: "Pattern très fiable après une consolidation ou une baisse prolongée. Chaque bougie doit ouvrir dans le corps de la précédente.",
    svg: `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="45" width="16" height="20" rx="1" fill="#22c55e"/>
      <rect x="28" y="33" width="16" height="20" rx="1" fill="#22c55e"/>
      <rect x="52" y="18" width="16" height="22" rx="1" fill="#22c55e"/>
    </svg>`,
  },
];

export interface Strategy {
  slug: string;
  name: string;
  level: string;
  description: string;
  steps: string[];
  pros: string;
  cons: string;
  color: string;
  bg: string;
}

export const STRATEGIES: Strategy[] = [
  {
    slug: "suivi-de-tendance",
    name: "Tendance (Trend Following)",
    level: "Débutant",
    description: "Suivre la direction principale du marché. Si le prix monte depuis plusieurs semaines, on achète. Si il descend, on évite.",
    steps: [
      "Regardez le graphique sur 3 mois. La ligne des prix monte ou descend ?",
      "Vérifiez que le prix est au-dessus de la MM50 (haussier) ou en dessous (baissier)",
      "Entrez dans la direction de la tendance, jamais contre elle",
      "Sortez quand le prix franchit la MM20 dans l'autre sens",
    ],
    pros: "Simple, peu de décisions à prendre",
    cons: "Peu efficace sur les marchés latéraux",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    slug: "retournement-support-resistance",
    name: "Retournement sur support/résistance",
    level: "Intermédiaire",
    description: "Les marchés rebondissent souvent sur les mêmes niveaux de prix. Un 'support' est un plancher que le prix a du mal à franchir à la baisse. Une 'résistance' est un plafond difficile à franchir à la hausse.",
    steps: [
      "Identifiez les zones où le prix a rebondi plusieurs fois dans le passé",
      "Attendez que le prix revienne tester cette zone",
      "Cherchez un chandelier de retournement (Marteau, Engulfing) pour confirmer",
      "Placez votre stop-loss juste en dessous du support",
    ],
    pros: "Excellent rapport risque/gain, stop-loss logique",
    cons: "Les supports peuvent être enfoncés — toujours utiliser un stop",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    slug: "cassure-breakout",
    name: "Cassure (Breakout)",
    level: "Intermédiaire",
    description: "Acheter quand le prix sort d'une zone de consolidation (trading range) vers le haut avec un volume élevé. Le prix accumule de l'énergie dans une range étroite, puis explose.",
    steps: [
      "Identifiez une zone où le prix oscille entre deux niveaux depuis plusieurs jours",
      "Attendez que le prix ferme clairement au-dessus de la résistance",
      "Vérifiez que le volume de la bougie de cassure est supérieur à la moyenne",
      "L'objectif est souvent la hauteur du range (même distance projetée vers le haut)",
    ],
    pros: "Fort momentum au départ, cibles claires",
    cons: "Les fausses cassures sont courantes — attendez la confirmation",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    slug: "dollar-cost-averaging-dca",
    name: "Dollar Cost Averaging (DCA)",
    level: "Débutant — Idéal pour commencer",
    description: "Investir la même somme à intervalles réguliers (ex: 100 $/mois) peu importe le prix du marché. Élimine le stress de 'choisir le bon moment'.",
    steps: [
      "Choisissez un montant fixe que vous pouvez investir chaque mois sans problème",
      "Choisissez un actif diversifié (ex: XEQT.TO, S&P500)",
      "Investissez ce montant chaque mois, que le marché monte ou descende",
      "Ne vous inquiétez pas des fluctuations à court terme — pensez à 5-10 ans",
    ],
    pros: "Élimine le risque de mauvais timing, convient aux débutants",
    cons: "Moins rentable que le lump sum en marché haussier fort",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    slug: "swing-trading",
    name: "Swing Trading",
    level: "Intermédiaire",
    description: "Garder une position de quelques jours à quelques semaines pour capturer un mouvement complet ('swing') du prix, sans surveiller l'écran toute la journée comme un day trader.",
    steps: [
      "Cherchez un actif qui vient de rebondir sur un support ou de casser une résistance",
      "Confirmez avec au moins 2 indicateurs (ex: RSI qui remonte + MM20 croisant à la hausse)",
      "Placez un stop-loss sous le dernier creux et un objectif basé sur la prochaine résistance",
      "Gardez la position 3 à 15 jours en général — revérifiez chaque soir, pas chaque minute",
    ],
    pros: "Compatible avec un horaire de travail/études normal, moins de stress que le day trading",
    cons: "Exposé au risque de nouvelles pendant la nuit (gaps à l'ouverture)",
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
  },
  {
    slug: "day-trading-intraday",
    name: "Day Trading (Intraday)",
    level: "Avancé",
    description: "Ouvrir et fermer toutes ses positions dans la même journée, sans jamais garder une position pendant la nuit. Exploite les mouvements de quelques minutes à quelques heures.",
    steps: [
      "Utilisez des bougies de 1 à 15 minutes pour repérer les mouvements",
      "Tradez seulement pendant les heures les plus actives (ouverture 9h30-11h et fin de journée 15h-16h HNE)",
      "Fixez un stop-loss serré (souvent basé sur l'ATR) et respectez-le sans exception",
      "Arrêtez-vous après 2-3 pertes consécutives dans la même journée — la discipline compte plus que le volume de trades",
    ],
    pros: "Aucun risque overnight, résultats rapides",
    cons: "Demande du temps plein devant l'écran, frais de transaction plus élevés, très exigeant psychologiquement",
    color: "text-red-500",
    bg: "bg-red-500/10",
  },
  {
    slug: "position-trading-long-terme",
    name: "Position Trading (long terme)",
    level: "Débutant",
    description: "Garder une position pendant plusieurs mois à plusieurs années, en s'appuyant sur la tendance de fond plutôt que sur les fluctuations quotidiennes.",
    steps: [
      "Analysez le graphique sur 1 à 5 ans pour confirmer une tendance de fond claire",
      "Ignorez les mouvements de moins de 10% — ce ne sont que du bruit à cette échelle",
      "Réévaluez la thèse d'investissement une fois par trimestre (résultats financiers, secteur)",
      "Sortez seulement si la tendance de fond change vraiment, pas sur une correction normale",
    ],
    pros: "Peu de temps requis, moins de frais, aligné avec la croissance à long terme des marchés",
    cons: "Capital immobilisé longtemps, demande de la patience face à la volatilité",
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    slug: "momentum-trading",
    name: "Momentum Trading",
    level: "Intermédiaire",
    description: "Acheter les actifs qui bougent déjà fortement dans une direction, en pariant que le mouvement va continuer à court terme ('la tendance qui accélère attire plus de tendance').",
    steps: [
      "Cherchez des titres avec un fort volume et un changement de prix de plusieurs % dans la journée",
      "Confirmez avec un RSI entre 50 et 70 (momentum sain, pas encore en surachat extrême)",
      "Entrez tôt dans le mouvement, jamais après une hausse de 20%+ déjà faite",
      "Utilisez un stop-loss serré et prenez des profits partiels rapidement",
    ],
    pros: "Peut générer des gains rapides sur des nouvelles ou catalyseurs",
    cons: "Très risqué, les retournements sont brutaux et rapides",
    color: "text-pink-500",
    bg: "bg-pink-500/10",
  },
  {
    slug: "retour-a-la-moyenne-mean-reversion",
    name: "Retour à la moyenne (Mean Reversion)",
    level: "Intermédiaire",
    description: "Parier qu'un prix qui s'est trop éloigné de sa moyenne mobile va revenir vers elle — l'inverse du suivi de tendance, utile dans les marchés qui oscillent sans direction claire.",
    steps: [
      "Identifiez un marché latéral (sans tendance forte) sur les 2-3 derniers mois",
      "Attendez que le RSI descende sous 30 (survente) ou monte au-dessus de 70 (surachat)",
      "Entrez en pariant sur un retour vers la MM20",
      "Sortez dès que le prix touche la moyenne mobile — ne visez pas plus",
    ],
    pros: "Fonctionne bien dans les marchés sans tendance",
    cons: "Dangereux si une vraie tendance démarre — le prix peut continuer loin de sa moyenne",
    color: "text-teal-500",
    bg: "bg-teal-500/10",
  },
  {
    slug: "scalping",
    name: "Scalping",
    level: "Avancé",
    description: "Multiplier les très petites prises de profit (quelques secondes à quelques minutes) sur un grand nombre de trades. Demande une exécution rapide et des frais très bas.",
    steps: [
      "Utilisez des bougies de 1 minute ou moins",
      "Ciblez des gains de 0,1% à 0,5% par trade, répétés plusieurs fois par heure",
      "Ne tradez que les actifs très liquides (spread faible) pour éviter que les frais mangent le profit",
      "Fixez une limite stricte de pertes quotidiennes et arrêtez-vous dès qu'elle est atteinte",
    ],
    pros: "Beaucoup d'opportunités, exposition minime au risque de marché",
    cons: "Frais de transaction cumulés élevés, extrêmement exigeant en concentration",
    color: "text-fuchsia-500",
    bg: "bg-fuchsia-500/10",
  },
  {
    slug: "trading-sur-nouvelles",
    name: "Trading sur nouvelles (News Trading)",
    level: "Avancé",
    description: "Prendre position en réaction à une nouvelle importante (rapport de résultats, décision de taux d'intérêt, annonce d'entreprise) qui peut provoquer un mouvement rapide et important.",
    steps: [
      "Suivez un calendrier économique (résultats trimestriels, annonces de banques centrales)",
      "Comprenez la nouvelle avant d'agir — le marché réagit parfois à l'inverse de l'intuition",
      "Attendez souvent les premières minutes de volatilité avant d'entrer, plutôt que la seconde exacte de l'annonce",
      "Utilisez une taille de position réduite — la volatilité est plus grande qu'en temps normal",
    ],
    pros: "Mouvements amples et rapides, opportunités claires et documentées",
    cons: "Très volatile, écarts de prix (slippage) fréquents, risque de faux signal initial",
    color: "text-yellow-600",
    bg: "bg-yellow-500/10",
  },
  {
    slug: "rotation-sectorielle",
    name: "Rotation sectorielle",
    level: "Intermédiaire",
    description: "Déplacer son capital d'un secteur économique à un autre selon le cycle économique (ex: technologie en période de croissance, énergie/santé en période défensive).",
    steps: [
      "Identifiez la phase du cycle économique actuel (expansion, ralentissement, récession, reprise)",
      "Repérez les secteurs historiquement forts dans cette phase (ex: techno en expansion, consommation de base en récession)",
      "Comparez la performance relative des ETF sectoriels sur 1-3 mois",
      "Ajustez graduellement, pas tout d'un coup — la rotation est progressive",
    ],
    pros: "Diversifie tout en restant actif dans les secteurs porteurs",
    cons: "Demande de suivre l'actualité macroéconomique régulièrement",
    color: "text-lime-600",
    bg: "bg-lime-500/10",
  },
  {
    slug: "trading-par-paires-pairs-trading",
    name: "Trading par paires (Pairs Trading)",
    level: "Avancé",
    description: "Acheter un actif et vendre à découvert un actif corrélé (ex: deux banques concurrentes) en pariant sur l'écart de performance entre les deux, peu importe la direction du marché global.",
    steps: [
      "Trouvez deux actifs historiquement très corrélés (ex: RY.TO et TD.TO)",
      "Repérez quand l'écart de performance entre les deux s'éloigne anormalement de la moyenne historique",
      "Achetez le plus faible, vendez à découvert le plus fort (ou l'inverse selon la thèse)",
      "Fermez la position quand l'écart revient à la normale",
    ],
    pros: "Peu sensible à la direction générale du marché",
    cons: "Stratégie complexe, la vente à découvert comporte un risque de perte illimité",
    color: "text-sky-500",
    bg: "bg-sky-500/10",
  },
  {
    slug: "investissement-de-valeur-value-investing",
    name: "Investissement de valeur (Value Investing)",
    level: "Débutant",
    description: "Acheter des entreprises solides que le marché sous-évalue par rapport à leurs bénéfices et à leurs actifs réels — la philosophie popularisée par Warren Buffett.",
    steps: [
      "Cherchez des entreprises avec un P/E ratio inférieur à la moyenne de leur secteur",
      "Vérifiez que l'entreprise génère des profits stables depuis plusieurs années",
      "Assurez-vous que la dette de l'entreprise reste raisonnable par rapport à ses revenus",
      "Achetez et gardez tant que la thèse fondamentale reste valide, indépendamment du bruit à court terme",
    ],
    pros: "Basé sur des données fondamentales solides, moins spéculatif",
    cons: "Peut prendre des années avant que le marché 'reconnaisse' la valeur",
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
  },
  {
    slug: "investissement-de-croissance-growth-investing",
    name: "Investissement de croissance (Growth Investing)",
    level: "Intermédiaire",
    description: "Investir dans des entreprises qui augmentent rapidement leurs revenus, même si leur valorisation actuelle semble élevée — on parie sur le futur plus que sur le présent.",
    steps: [
      "Cherchez une croissance de revenus soutenue de 20%+ par année",
      "Vérifiez que l'entreprise a un avantage compétitif clair (technologie, marque, réseau)",
      "Acceptez une valorisation plus élevée (P/E haut) en échange du potentiel de croissance",
      "Surveillez si la croissance ralentit — c'est souvent le signal pour réduire la position",
    ],
    pros: "Potentiel de gain élevé sur les leaders de demain",
    cons: "Plus volatile, très sensible aux hausses de taux d'intérêt",
    color: "text-violet-600",
    bg: "bg-violet-500/10",
  },
  {
    slug: "croissance-du-dividende",
    name: "Croissance du dividende (Dividend Growth)",
    level: "Débutant",
    description: "Investir dans des entreprises qui versent et augmentent régulièrement leur dividende chaque année, pour un revenu passif croissant dans le temps.",
    steps: [
      "Cherchez des entreprises avec un historique d'au moins 5-10 ans d'augmentation du dividende",
      "Vérifiez le ratio de distribution (payout ratio) — idéalement sous 60% des profits",
      "Réinvestissez les dividendes reçus pour profiter de l'effet composé",
      "Diversifiez sur plusieurs secteurs pour ne pas dépendre d'une seule industrie",
    ],
    pros: "Revenu passif régulier, historiquement moins volatile",
    cons: "Croissance du capital plus lente que les actions de croissance pure",
    color: "text-amber-600",
    bg: "bg-amber-500/10",
  },
  {
    slug: "pyramidage-position",
    name: "Pyramidage de position",
    level: "Avancé",
    description: "Ajouter progressivement à une position gagnante à mesure qu'elle confirme la thèse initiale, plutôt que de tout miser d'un coup — permet de maximiser les gagnants tout en limitant le risque initial.",
    steps: [
      "Entrez avec une petite taille de position initiale (ex: 30% de la taille visée)",
      "Ajoutez seulement si le prix confirme la direction (nouveau plus haut, croisement d'indicateur)",
      "Remontez le stop-loss à chaque ajout pour protéger les gains déjà faits",
      "Ne jamais ajouter à une position perdante (ça, c'est du 'moyennage à la baisse', à éviter)",
    ],
    pros: "Maximise l'exposition aux gagnants, limite le risque sur les mauvaises idées",
    cons: "Complexe à gérer, demande une discipline stricte pour ne pas ajouter au mauvais moment",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
  {
    slug: "routine-entrainement-backtesting",
    name: "Entraînement : routine de backtesting personnel",
    level: "Entraînement pratique",
    description: "Un exercice à faire chaque semaine pour progresser sans risquer d'argent réel : revoir vos décisions passées comme un athlète revoit ses matchs.",
    steps: [
      "Choisissez 5 titres que vous suivez et regardez leur graphique des 3 derniers mois",
      "Pour chaque pattern ou signal appris (chandelier, RSI, croisement MM), notez où vous auriez acheté/vendu",
      "Comparez avec ce qui s'est réellement passé après — utilisez la section Backtesting de patterns de cette app",
      "Notez ce qui a fonctionné et ce qui a échoué dans un journal, puis ajustez vos règles",
    ],
    pros: "Progression rapide sans risquer d'argent réel",
    cons: "Le passé ne garantit jamais le futur — sert à construire l'intuition, pas des certitudes",
    color: "text-slate-500",
    bg: "bg-slate-500/10",
  },
  {
    slug: "routine-entrainement-papier",
    name: "Entraînement : simulateur de trading papier (paper trading)",
    level: "Entraînement pratique",
    description: "Pratiquer vos stratégies en conditions réelles de marché mais sans argent réel, en utilisant le simulateur intégré à cette app (section Journal de trading).",
    steps: [
      "Fixez-vous un capital fictif de départ réaliste (ex: 5 000 $) dans le simulateur",
      "Appliquez une seule stratégie à la fois pendant au moins 20 trades avant d'en juger les résultats",
      "Respectez exactement les mêmes règles de gestion du risque que si c'était de l'argent réel",
      "Ne passez à l'argent réel qu'après avoir été rentable sur au moins 30 trades simulés consécutifs",
    ],
    pros: "Zéro risque financier pendant l'apprentissage, construit la discipline",
    cons: "L'absence d'émotion réelle (peur de perdre de l'argent) rend le passage au réel plus difficile qu'il n'y paraît",
    color: "text-blue-600",
    bg: "bg-blue-500/10",
  },
  {
    slug: "grid-trading",
    name: "Grid Trading (trading en grille)",
    level: "Avancé",
    description: "Placer une série d'ordres d'achat et de vente à intervalles de prix réguliers autour du prix actuel, pour profiter automatiquement des oscillations dans un marché sans tendance claire — populaire sur les cryptos.",
    steps: [
      "Définissez une fourchette de prix (ex: entre -10% et +10% du prix actuel)",
      "Divisez cette fourchette en plusieurs niveaux (ex: tous les 2%)",
      "Placez un ordre d'achat à chaque niveau en dessous et de vente à chaque niveau au-dessus",
      "Fonctionne mieux sur un actif volatile mais globalement stable (sans forte tendance directionnelle)",
    ],
    pros: "Automatisable, profite de la volatilité sans devoir prédire la direction",
    cons: "Perd de l'argent si une forte tendance sort de la fourchette définie",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
];

export interface GlossaryTerm {
  slug: string;
  term: string;
  definition: string;
  category: string;
}

export const GLOSSAIRE: GlossaryTerm[] = [
  { slug: "action-stock", term: "Action (Stock)", definition: "Part de propriété d'une entreprise cotée en bourse. En achetant une action AAPL, vous devenez copropriétaire d'Apple.", category: "Bases" },
  { slug: "etf-fnb", term: "ETF / FNB", definition: "Fonds négocié en bourse qui regroupe plusieurs actifs (ex: les 500 plus grandes entreprises US pour le S&P500 ETF). Moins risqué qu'une seule action.", category: "Bases" },
  { slug: "indice-boursier", term: "Indice boursier", definition: "Mesure de la performance d'un groupe d'actions (ex: S&P500 = 500 plus grandes entreprises US). Thermomètre de la santé du marché.", category: "Bases" },
  { slug: "capitalisation-boursiere", term: "Capitalisation boursière", definition: "Valeur totale d'une entreprise en bourse = Prix de l'action × Nombre d'actions. Apple : ~3 000 milliards $.", category: "Bases" },
  { slug: "volume", term: "Volume", definition: "Nombre d'actions ou de contrats échangés sur une période. Un volume élevé lors d'un mouvement de prix le rend plus significatif.", category: "Bases" },
  { slug: "spread", term: "Spread", definition: "Différence entre le prix d'achat (ask) et le prix de vente (bid). C'est le coût invisible de chaque transaction.", category: "Bases" },
  { slug: "dividende", term: "Dividende", definition: "Portion des bénéfices d'une entreprise versée aux actionnaires, généralement trimestriellement.", category: "Bases" },
  { slug: "liquidite", term: "Liquidité", definition: "Facilité à acheter ou vendre un actif sans impacter son prix. Apple est très liquide ; une micro-cap canadienne l'est beaucoup moins.", category: "Bases" },
  { slug: "tendance-haussiere-bullish", term: "Tendance haussière (Bullish)", definition: "Marché ou actif qui monte sur la durée. Série de plus hauts et plus bas ascendants.", category: "Tendances" },
  { slug: "tendance-baissiere-bearish", term: "Tendance baissière (Bearish)", definition: "Marché ou actif qui descend sur la durée. Série de plus hauts et plus bas descendants.", category: "Tendances" },
  { slug: "marche-lateral-sideways", term: "Marché latéral (Sideways)", definition: "Prix qui oscille dans une plage sans tendance claire. Difficile pour les traders de tendance.", category: "Tendances" },
  { slug: "support", term: "Support", definition: "Niveau de prix où le marché a tendance à rebondir car les acheteurs sont plus nombreux que les vendeurs. Plancher du prix.", category: "Niveaux" },
  { slug: "resistance", term: "Résistance", definition: "Niveau de prix difficile à franchir à la hausse car les vendeurs dominent. Plafond du prix.", category: "Niveaux" },
  { slug: "cassure-breakout-def", term: "Cassure (Breakout)", definition: "Franchissement d'un support ou d'une résistance avec du volume. Souvent suivi d'un fort mouvement.", category: "Niveaux" },
  { slug: "retracement-fibonacci", term: "Retracement de Fibonacci", definition: "Niveaux de pullback courants après un mouvement (23,6%, 38,2%, 50%, 61,8%). Les traders y placent leurs ordres.", category: "Niveaux" },
  { slug: "rsi", term: "RSI (Relative Strength Index)", definition: "Indicateur de 0 à 100. En dessous de 30 : survente (rebond probable). Au-dessus de 70 : surachat (repli possible).", category: "Indicateurs" },
  { slug: "macd", term: "MACD", definition: "Indicateur de momentum. Croisement haussier = signal d'achat potentiel. Croisement baissier = signal de vente.", category: "Indicateurs" },
  { slug: "moyenne-mobile-mm-sma", term: "Moyenne mobile (MM/SMA)", definition: "Moyenne des prix sur N jours. Lisse les fluctuations et montre la tendance. MM200 = tendance long terme.", category: "Indicateurs" },
  { slug: "bandes-de-bollinger", term: "Bandes de Bollinger", definition: "Enveloppe autour du prix basée sur l'écart-type. Le prix touche la bande basse → rebond probable. Bande haute → résistance.", category: "Indicateurs" },
  { slug: "volume-on-balance-obv", term: "Volume on Balance (OBV)", definition: "Cumule le volume selon la direction du prix. Si le prix monte avec un OBV croissant, la hausse est confirmée.", category: "Indicateurs" },
  { slug: "stop-loss", term: "Stop-loss", definition: "Ordre de vente automatique si le prix tombe à un niveau prédéfini. Protège contre les grosses pertes.", category: "Gestion des risques" },
  { slug: "take-profit", term: "Take profit", definition: "Ordre de vente automatique si le prix atteint votre objectif de gain.", category: "Gestion des risques" },
  { slug: "rapport-risque-gain-rr", term: "Rapport risque/gain (R:R)", definition: "Si vous risquez 100 $ pour gagner 300 $, votre R:R est 1:3. Visez toujours un minimum de 1:2.", category: "Gestion des risques" },
  { slug: "taille-de-position", term: "Taille de position", definition: "Montant investi dans un seul actif. Règle commune : ne jamais risquer plus de 1-2% de son capital sur une seule trade.", category: "Gestion des risques" },
  { slug: "drawdown", term: "Drawdown", definition: "Baisse maximale depuis un pic. Si votre portefeuille passe de 10 000 $ à 8 000 $, le drawdown est 20%.", category: "Gestion des risques" },
  { slug: "levier-leverage", term: "Levier (Leverage)", definition: "Emprunter pour multiplier les gains potentiels — et les pertes. Déconseillé aux débutants. 10x levier = 10x le risque.", category: "Gestion des risques" },
  { slug: "diversification", term: "Diversification", definition: "Répartir son capital sur plusieurs actifs non-corrélés pour réduire le risque global.", category: "Gestion des risques" },
  { slug: "correlation", term: "Corrélation", definition: "Mesure si deux actifs bougent ensemble (+1) ou à l'opposé (-1). Un portefeuille bien diversifié a des actifs peu corrélés.", category: "Avancé" },
  { slug: "pe-ratio-per", term: "P/E Ratio (PER)", definition: "Prix / Bénéfice par action. Mesure si une action est chère par rapport à ses bénéfices. PER de 15 = normal, 50+ = cher.", category: "Fondamentaux" },
  { slug: "short-selling-vente-a-decouvert", term: "Short selling / Vente à découvert", definition: "Vendre un actif qu'on ne possède pas en espérant le racheter moins cher. Risque illimité si le prix monte.", category: "Avancé" },
  { slug: "chandelier-japonais", term: "Chandelier japonais", definition: "Représentation graphique d'un prix sur une période donnée : ouverture, clôture, haut et bas. Inventé par les marchands japonais de riz au XVIIe siècle.", category: "Bases" },
  { slug: "bougie-verte-bougie-rouge", term: "Bougie verte / Bougie rouge", definition: "Verte = clôture au-dessus de l'ouverture (prix a monté). Rouge = clôture en dessous (prix a baissé).", category: "Bases" },
  { slug: "meche-wick-shadow", term: "Mèche (Wick/Shadow)", definition: "Ligne fine au-dessus ou en dessous du corps d'une bougie. Représente les extrêmes atteints pendant la période.", category: "Bases" },
  { slug: "ipo-introduction-en-bourse", term: "IPO (Introduction en bourse)", definition: "Première mise sur le marché des actions d'une entreprise. Souvent volatile dans les premiers jours.", category: "Événements" },
  { slug: "bear-market", term: "Bear market", definition: "Marché en baisse de plus de 20% depuis un sommet. Souvent lié à des récessions ou crises.", category: "Tendances" },
  { slug: "bull-market", term: "Bull market", definition: "Marché en hausse de plus de 20% depuis un creux. Période de confiance et d'optimisme.", category: "Tendances" },
  { slug: "swing-trading-def", term: "Swing Trading", definition: "Style de trading où l'on garde une position quelques jours à quelques semaines pour capturer un mouvement complet du prix.", category: "Styles de trading" },
  { slug: "day-trading-def", term: "Day Trading", definition: "Ouvrir et fermer toutes ses positions dans la même journée, sans jamais garder de position pendant la nuit.", category: "Styles de trading" },
  { slug: "scalping-def", term: "Scalping", definition: "Style de trading ultra court terme visant de très petits gains répétés sur un grand nombre de trades.", category: "Styles de trading" },
  { slug: "position-trading-def", term: "Position Trading", definition: "Garder une position pendant plusieurs mois à plusieurs années en s'appuyant sur la tendance de fond.", category: "Styles de trading" },
  { slug: "momentum-def", term: "Momentum", definition: "Vitesse et force d'un mouvement de prix. Un fort momentum haussier signale une pression acheteuse dominante.", category: "Indicateurs" },
  { slug: "atr", term: "ATR (Average True Range)", definition: "Mesure de la volatilité moyenne d'un actif en dollars sur une période donnée. Utile pour placer un stop-loss réaliste.", category: "Indicateurs" },
  { slug: "structure-de-marche", term: "Structure de marché", definition: "Analyse de la séquence des sommets et creux récents pour déterminer si le marché est en tendance haussière, baissière ou en range.", category: "Niveaux" },
  { slug: "divergence", term: "Divergence", definition: "Quand le prix et un indicateur (RSI, MACD) évoluent dans des directions opposées — souvent un signal avant-coureur de retournement.", category: "Indicateurs" },
  { slug: "gap-de-prix", term: "Gap de prix", definition: "Écart entre la clôture d'une séance et l'ouverture de la suivante, souvent causé par une nouvelle après la fermeture du marché.", category: "Niveaux" },
  { slug: "slippage", term: "Slippage", definition: "Différence entre le prix attendu d'un ordre et le prix réellement exécuté, fréquent lors de forte volatilité.", category: "Gestion des risques" },
  { slug: "money-management", term: "Money Management (Gestion de capital)", definition: "Ensemble des règles qui déterminent combien investir sur chaque trade pour protéger le capital total sur le long terme.", category: "Gestion des risques" },
  { slug: "backtesting", term: "Backtesting", definition: "Tester une stratégie sur des données historiques pour évaluer sa performance avant de l'utiliser avec de l'argent réel.", category: "Avancé" },
  { slug: "paper-trading", term: "Paper Trading (trading simulé)", definition: "Pratiquer le trading avec de l'argent fictif pour s'entraîner sans risque financier réel.", category: "Avancé" },
  { slug: "rotation-sectorielle-def", term: "Rotation sectorielle", definition: "Déplacement du capital d'un secteur économique à un autre selon la phase du cycle économique.", category: "Avancé" },
  { slug: "penny-stock", term: "Penny Stock", definition: "Action à très faible prix (souvent moins de 5$) et forte volatilité, généralement d'une petite entreprise peu liquide.", category: "Bases" },
  { slug: "blue-chip", term: "Blue Chip", definition: "Action d'une grande entreprise stable et bien établie (ex: Apple, Coca-Cola), généralement moins volatile.", category: "Bases" },
  { slug: "market-order-limit-order", term: "Ordre au marché vs ordre limite", definition: "Un ordre au marché s'exécute immédiatement au prix disponible ; un ordre limite s'exécute seulement au prix choisi ou meilleur.", category: "Bases" },
  { slug: "pre-market-after-hours", term: "Pre-market / After-hours", definition: "Périodes de négociation avant l'ouverture officielle (pre-market) ou après la fermeture (after-hours), avec généralement moins de liquidité.", category: "Bases" },
  { slug: "quantite-vs-prix-moyen", term: "Prix moyen pondéré (moyennage)", definition: "Prix moyen payé pour un actif acheté en plusieurs fois à des prix différents. Le DCA fonctionne sur ce principe.", category: "Bases" },
  { slug: "beta", term: "Bêta", definition: "Mesure de la volatilité d'une action par rapport au marché global. Bêta de 1,5 = 50% plus volatile que le marché.", category: "Avancé" },
  { slug: "capitalisation-vs-flottant", term: "Flottant (Float)", definition: "Nombre d'actions réellement disponibles à la négociation publique. Un flottant faible peut causer une forte volatilité.", category: "Avancé" },
];
