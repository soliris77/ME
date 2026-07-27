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

// ── Erreurs fréquentes par chandelier ────────────────────────────────────────
export const CANDLE_MISTAKES: Record<string, string[]> = {
  "marteau-hammer": [
    "Acheter dès que la bougie apparaît sans attendre la confirmation de la bougie suivante.",
    "Confondre un marteau dans une tendance haussière (pas de signal de retournement) avec un marteau au bas d'une baisse.",
    "Ignorer le volume — un marteau sans volume élevé est beaucoup moins fiable.",
  ],
  "etoile-filante-shooting-star": [
    "Vendre à découvert sans attendre la confirmation de la bougie suivante rouge.",
    "Chercher ce pattern en plein milieu d'une tendance plutôt qu'uniquement au sommet d'une hausse.",
    "Négliger de vérifier que la mèche supérieure est au moins deux fois la longueur du corps.",
  ],
  "doji": [
    "Interpréter le doji seul comme un signal de vente ou d'achat, sans attendre la bougie suivante.",
    "Ignorer le contexte — un doji dans un marché latéral ne signifie rien de particulier.",
    "Confondre tous les types de doji (libellule, pierre tombale, doji neutre) qui ont des significations différentes.",
  ],
  "engulfing-haussier": [
    "Entrer en position sans vérifier que le pattern est bien au bas d'une tendance baissière.",
    "Accepter un engulfing partiel (la bougie verte n'engloutit pas entièrement la rouge) comme signal valide.",
    "Ne pas tenir compte du volume — une bougie verte sans volume significatif diminue la fiabilité.",
  ],
  "engulfing-baissier": [
    "L'utiliser comme signal de vente à découvert sans l'identifier clairement au sommet d'une tendance haussière.",
    "Accepter que la bougie rouge n'engloutisse pas complètement le corps de la bougie verte précédente.",
    "Oublier de placer un stop-loss au-dessus du sommet de la bougie rouge.",
  ],
  "etoile-du-matin-morning-star": [
    "Acheter dès la 2e bougie (petite) plutôt qu'attendre la confirmation de la 3e bougie verte.",
    "Ne pas vérifier que la 3e bougie ferme au-dessus de la moitié du corps de la 1re bougie rouge.",
    "Utiliser le pattern dans un marché latéral où il perd toute sa valeur prédictive.",
  ],
  "etoile-du-soir-evening-star": [
    "Vendre dès l'apparition de la petite bougie centrale sans attendre la confirmation de la grande rouge.",
    "Ne pas combiner avec un RSI > 70 pour renforcer la conviction du signal.",
    "Confondre avec une simple pause dans une tendance haussière solide sans context de surachat.",
  ],
  "trois-soldats-blancs": [
    "Acheter après que le pattern soit complètement formé alors que le prix est déjà très éloigné du support.",
    "Ignorer que si les mèches supérieures sont longues, le pattern est moins fiable (vendeurs encore présents).",
    "Entrer en pleine euphorie de marché sans vérifier si la zone est proche d'une résistance majeure.",
  ],
};

// ── Erreurs fréquentes par stratégie ─────────────────────────────────────────
export const STRATEGY_MISTAKES: Record<string, string[]> = {
  "suivi-de-tendance": [
    "Entrer dans la tendance trop tard, après que le mouvement principal soit déjà épuisé.",
    "Ne pas sortir quand le prix franchit la MM20 dans l'autre sens — rester accroché à l'espoir.",
    "Tenter d'appliquer la stratégie dans un marché clairement latéral.",
  ],
  "retournement-support-resistance": [
    "Confondre un niveau de support testé une seule fois avec un support solide (il faut au moins 2-3 rebonds).",
    "Entrer sur le premier contact avec le support sans attendre un chandelier de confirmation.",
    "Ne pas placer le stop-loss juste sous le support, mais trop loin ou trop proche.",
  ],
  "cassure-breakout": [
    "Entrer sur une cassure sans vérifier que le volume est supérieur à la moyenne — les fausses cassures sans volume sont fréquentes.",
    "Ne pas attendre que la bougie ferme au-dessus de la résistance avant d'entrer.",
    "Viser un objectif trop ambitieux au lieu de mesurer la hauteur du range comme cible initiale.",
  ],
  "dollar-cost-averaging-dca": [
    "Paniquer et arrêter les achats automatiques quand le marché baisse — c'est précisément le meilleur moment.",
    "Appliquer le DCA sur un actif très risqué ou une seule action au lieu d'un ETF diversifié.",
    "Choisir un montant mensuel trop élevé qui crée un stress financier et pousse à interrompre la stratégie.",
  ],
  "swing-trading": [
    "Vérifier son graphique toutes les heures au lieu de faire confiance à l'analyse faite en soirée.",
    "Garder la position bien au-delà de l'objectif fixé par espoir de gain supplémentaire.",
    "Ne pas tenir compte du risque de gap à l'ouverture, surtout avant un rapport de résultats.",
  ],
  "day-trading-intraday": [
    "Continuer à trader après 2-3 pertes consécutives dans la même journée au lieu de s'arrêter.",
    "Trader pendant les heures creuses de l'après-midi (12h-14h HNE) où la liquidité est faible.",
    "Sous-estimer l'impact des frais de transaction qui s'accumulent sur des dizaines de trades.",
  ],
  "position-trading-long-terme": [
    "Paniquer lors d'une correction de 10-15% et vendre alors que la tendance de fond est intacte.",
    "Ne jamais réévaluer la thèse fondamentale — si les bénéfices de l'entreprise s'effondrent, il faut sortir.",
    "Confondre une consolidation normale avec un changement de tendance de fond.",
  ],
  "momentum-trading": [
    "Entrer après une hausse de 20%+ déjà faite en pensant que le mouvement va continuer indéfiniment.",
    "Utiliser une taille de position trop grande sur un titre très volatile sans stop-loss serré.",
    "Ignorer le RSI — acheter un titre avec un RSI > 80 augmente drastiquement le risque de retournement brutal.",
  ],
  "retour-a-la-moyenne-mean-reversion": [
    "Appliquer cette stratégie dans un marché en forte tendance directionnelle — le prix peut continuer loin de la moyenne.",
    "Entrer dès que le RSI touche 30 sans vérifier que le marché est effectivement dans un range.",
    "Viser la MM50 ou MM200 comme cible au lieu de se contenter de la MM20, plus prudente.",
  ],
  "scalping": [
    "Sous-estimer l'effet des frais de transaction qui peuvent annuler tous les gains sur de petits mouvements.",
    "Trader des actifs peu liquides avec un spread large qui gruge immédiatement la marge de profit.",
    "Ne pas fixer de limite de pertes journalières et continuer à scalper après une série perdante.",
  ],
  "trading-sur-nouvelles": [
    "Entrer au moment exact de l'annonce — le slippage et la volatilité initiale sont souvent défavorables.",
    "Supposer que 'bonne nouvelle = prix monte' sans comprendre que le marché escompte souvent la nouvelle à l'avance.",
    "Utiliser une taille de position normale alors que la volatilité est 3 à 5 fois plus élevée qu'en temps normal.",
  ],
  "rotation-sectorielle": [
    "Tout réallouer d'un seul coup au lieu de faire la rotation progressivement sur plusieurs semaines.",
    "Confondre un mouvement sectoriel de quelques jours avec un vrai changement de cycle économique.",
    "Négliger de suivre les indicateurs macroéconomiques et se baser uniquement sur la performance récente.",
  ],
  "trading-par-paires-pairs-trading": [
    "Supposer que deux actifs resteront corrélés indéfiniment — les corrélations peuvent changer avec le temps.",
    "Mal calibrer la taille des deux positions et créer une exposition directionnelle non voulue au marché.",
    "Ignorer le coût du financement de la vente à découvert qui érode la rentabilité sur la durée.",
  ],
  "investissement-de-valeur-value-investing": [
    "Acheter une action 'bon marché' sans analyser pourquoi le marché la sous-évalue — parfois c'est mérité.",
    "Manquer de patience et vendre après quelques mois alors que la stratégie fonctionne sur des années.",
    "Se concentrer uniquement sur le P/E ratio sans regarder la dette, les flux de trésorerie et la croissance.",
  ],
  "investissement-de-croissance-growth-investing": [
    "Payer n'importe quelle valorisation sans considérer si la croissance future est déjà intégrée dans le prix.",
    "Ne pas réduire la position quand la croissance des revenus ralentit significativement.",
    "Surpondérer les actions de croissance dans un environnement de hausse de taux d'intérêt qui les pénalise.",
  ],
  "croissance-du-dividende": [
    "Choisir les actions uniquement sur la base d'un dividende élevé sans vérifier la durabilité du payout ratio.",
    "Ignorer la croissance du dividende et privilégier un rendement immédiat élevé souvent signe de détresse.",
    "Ne pas diversifier entre secteurs et concentrer le portefeuille dans les utilities et télécoms seulement.",
  ],
  "pyramidage-position": [
    "Ajouter à une position perdante ('moyennage à la baisse') en confondant ça avec le pyramidage.",
    "Ne pas remonter le stop-loss à chaque ajout, laissant le risque total exploser avec la taille de position.",
    "Ajouter sans que le prix ait confirmé un nouveau plus haut — entrer trop tôt dans la séquence.",
  ],
  "routine-entrainement-backtesting": [
    "Adapter inconsciemment les règles pour que ça fonctionne sur les données passées (overfitting).",
    "Backtester sur seulement quelques mois au lieu d'inclure différentes conditions de marché (bull, bear, latéral).",
    "Croire que des résultats parfaits en backtest garantissent des résultats équivalents en conditions réelles.",
  ],
  "routine-entrainement-papier": [
    "Ne pas respecter les règles de gestion du risque en paper trading parce qu'il n'y a pas d'argent réel en jeu.",
    "Passer à l'argent réel trop vite, après seulement 5-10 trades simulés, sans base statistique suffisante.",
    "Sous-estimer l'impact émotionnel quand de l'argent réel est en jeu — le comportement change radicalement.",
  ],
  "grid-trading": [
    "Définir une grille trop étroite qui se retrouve complètement hors range lors d'un mouvement directionnel fort.",
    "Appliquer la stratégie sur un actif en forte tendance au lieu d'un actif oscillant dans un range stable.",
    "Ne pas prévoir de mécanisme de sortie si le prix sort définitivement de la fourchette définie.",
  ],
};

// ── Erreurs fréquentes par terme de glossaire ─────────────────────────────────
export const GLOSSARY_MISTAKES: Record<string, string[]> = {
  "action-stock": [
    "Croire qu'acheter une action rend propriétaire d'une entreprise avec droits de gestion — les droits réels sont très limités.",
    "Confondre la valeur d'une action (prix) avec la valeur réelle de l'entreprise (capitalisation boursière).",
  ],
  "etf-fnb": [
    "Penser qu'un ETF est toujours diversifié — certains ETFs sectoriels ou à effet de levier sont très concentrés et risqués.",
    "Ignorer le ratio de frais de gestion (MER) qui varie beaucoup d'un ETF à l'autre.",
  ],
  "indice-boursier": [
    "Confondre l'indice lui-même avec un actif qu'on peut acheter directement — on achète un ETF qui réplique l'indice.",
    "Croire que si l'indice monte, toutes les actions qu'il contient montent aussi.",
  ],
  "capitalisation-boursiere": [
    "Confondre un prix d'action bas avec une 'petite' entreprise — une action à 5 $ peut représenter une capitalisation de plusieurs milliards.",
    "Ignorer que la capitalisation boursière ne reflète pas nécessairement la valeur comptable réelle des actifs.",
  ],
  "volume": [
    "Ignorer le volume et trader un signal de prix sans confirmer avec le volume — les mouvements sans volume sont souvent des faux signaux.",
    "Comparer le volume absolu entre deux actifs différents au lieu de le comparer à la moyenne historique du même actif.",
  ],
  "spread": [
    "Négliger le spread sur les actifs peu liquides où il peut représenter plusieurs pourcents du prix.",
    "Oublier que le spread est payé à chaque achat et à chaque vente, doublant son coût effectif.",
  ],
  "dividende": [
    "Acheter une action juste avant le dividende ('dividend capture') sans comprendre que le prix baisse du montant du dividende à la date ex-dividende.",
    "Confondre le rendement du dividende actuel avec la croissance future du dividende.",
  ],
  "liquidite": [
    "Entrer dans une position illiquide sans réaliser qu'il sera difficile d'en sortir rapidement sans impacter le prix.",
    "Croire qu'un actif populaire est forcément liquide — sur les cryptos ou les penny stocks, la liquidité peut s'évaporer rapidement.",
  ],
  "tendance-haussiere-bullish": [
    "Qualifier une hausse de deux jours de 'tendance haussière' — une vraie tendance se confirme sur plusieurs semaines.",
    "Confondre une correction dans une tendance haussière avec un retournement baissier.",
  ],
  "tendance-baissiere-bearish": [
    "Paniquer et tout vendre lors d'une correction normale dans une tendance haussière de fond.",
    "Croire qu'une tendance baissière va durer indéfiniment sans considérer les niveaux de support.",
  ],
  "marche-lateral-sideways": [
    "Appliquer des stratégies de suivi de tendance dans un marché latéral, générant de nombreuses fausses sorties.",
    "Sous-estimer la durée possible d'un marché latéral — il peut durer des mois avant une vraie cassure.",
  ],
  "support": [
    "Considérer un support comme absolu — tout support peut être enfoncé, toujours utiliser un stop-loss.",
    "Placer un ordre d'achat exactement au niveau du support sans anticiper qu'il peut être légèrement dépassé avant de rebondir.",
  ],
  "resistance": [
    "Vendre systématiquement à la résistance sans réaliser qu'une cassure franche transforme la résistance en nouveau support.",
    "Identifier une résistance sur une seule période temporelle sans vérifier sa cohérence sur des timeframes supérieurs.",
  ],
  "cassure-breakout-def": [
    "Considérer toute clôture au-dessus d'une résistance comme une vraie cassure — attendre le volume de confirmation.",
    "Ignorer les fausses cassures fréquentes qui piègent les acheteurs trop rapides avant que le prix revienne dans la range.",
  ],
  "retracement-fibonacci": [
    "Traiter les niveaux de Fibonacci comme des zones de support/résistance magiques au lieu de zones de probabilité.",
    "Appliquer les retracements sur des mouvements trop courts qui n'ont pas de swing clair à mesurer.",
  ],
  "rsi": [
    "Vendre automatiquement quand le RSI dépasse 70 sans réaliser qu'en forte tendance il peut rester au-dessus de 70 longtemps.",
    "Utiliser le RSI sans tenir compte du contexte — en tendance baissière, le RSI à 50 peut déjà signaler une résistance.",
  ],
  "macd": [
    "Interpréter chaque croisement de lignes comme un signal d'achat ou de vente fiable — les faux croisements sont fréquents dans les marchés latéraux.",
    "Ignorer la position de l'histogramme par rapport à zéro qui donne plus d'information que le simple croisement.",
  ],
  "moyenne-mobile-mm-sma": [
    "Changer la période de la MM constamment selon ce qui 'aurait fonctionné' sur le passé — choisissez une période et restez cohérent.",
    "Utiliser la MM comme signal d'entrée seul, sans confirmation d'un autre indicateur ou d'un chandelier.",
  ],
  "bandes-de-bollinger": [
    "Acheter systématiquement quand le prix touche la bande basse sans réaliser qu'en forte tendance baissière le prix peut longer la bande.",
    "Confondre un rétrécissement des bandes (faible volatilité) avec un signal directionnel — c'est simplement une compression avant un mouvement.",
  ],
  "volume-on-balance-obv": [
    "Ignorer les divergences entre l'OBV et le prix qui sont souvent les signaux les plus précieux de ce cet indicateur.",
    "Comparer les valeurs absolues de l'OBV entre différents actifs — seule la direction et les divergences importent.",
  ],
  "stop-loss": [
    "Déplacer son stop-loss vers le bas pour éviter d'être stoppé — c'est la cause principale des grosses pertes.",
    "Placer le stop-loss à un niveau rond (ex: exactement à 100 $) où de nombreux stops sont concentrés et souvent chassés par les institutions.",
  ],
  "take-profit": [
    "Ne jamais utiliser de take-profit et laisser les gains s'évaporer par excès de confiance.",
    "Fixer un take-profit arbitraire sans le baser sur le prochain niveau de résistance ou le rapport risque/gain.",
  ],
  "rapport-risque-gain-rr": [
    "Accepter des trades avec un R:R inférieur à 1:2 en espérant compenser avec un taux de réussite élevé.",
    "Calculer le R:R après l'entrée au lieu de le valider comme condition d'entrée avant de trader.",
  ],
  "taille-de-position": [
    "Utiliser toujours la même taille de position fixe en dollars au lieu de l'adapter au stop-loss pour maintenir un risque constant en %.",
    "Augmenter la taille de position après une série gagnante — l'overconfidence mène souvent à un trade catastrophique.",
  ],
  "drawdown": [
    "Confondre le drawdown maximum (pire cas historique) avec le drawdown actuel dans l'évaluation d'une stratégie.",
    "Sous-estimer l'impact psychologique d'un drawdown de 30% qui est mathématiquement plus difficile à récupérer que prévu.",
  ],
  "levier-leverage": [
    "Penser que le levier amplifie uniquement les gains — il amplifie également les pertes du même facteur.",
    "Utiliser le levier maximal disponible sans calculer qu'une petite correction peut liquider toute la position.",
  ],
  "diversification": [
    "Croire qu'acheter 10 actions technologiques est une diversification — la diversification réelle exige des actifs peu corrélés.",
    "Sur-diversifier avec 30+ positions qu'il est impossible de suivre correctement, diluant les gains sans réduire proportionnellement le risque.",
  ],
  "correlation": [
    "Supposer que les corrélations historiques restent stables en période de crise — elles ont tendance à converger vers 1 lors des krachs.",
    "Confondre corrélation et causalité — deux actifs corrélés ne signifie pas que l'un influence l'autre.",
  ],
  "pe-ratio-per": [
    "Comparer le P/E d'une entreprise de croissance avec celui d'une entreprise mature sans tenir compte des différences sectorielles.",
    "Utiliser uniquement le P/E historique sans considérer le P/E forward (basé sur les bénéfices futurs estimés).",
  ],
  "short-selling-vente-a-decouvert": [
    "Ignorer que la perte potentielle est théoriquement illimitée car le prix peut monter indéfiniment.",
    "Ne pas tenir compte du coût d'emprunt des actions qui s'accumule chaque jour la position est ouverte.",
  ],
  "chandelier-japonais": [
    "Chercher des patterns parfaits qui correspondent exactement aux illustrations du livre — les chandeliers réels sont rarement parfaits.",
    "Prendre des décisions sur un seul chandelier sans le contexte de la tendance générale et des niveaux clés.",
  ],
  "bougie-verte-bougie-rouge": [
    "Croire que la couleur seule détermine la force du mouvement — une petite bougie verte avec de longues mèches est souvent indécise.",
    "Confondre des applications qui utilisent la convention inversée (blanc/noir ou bleu/rouge) et mal interpréter les signaux.",
  ],
  "meche-wick-shadow": [
    "Ignorer les mèches longues qui représentent souvent des rejections importantes de niveaux de prix clés.",
    "Ne pas utiliser le bas de la mèche inférieure comme niveau naturel pour placer un stop-loss.",
  ],
  "ipo-introduction-en-bourse": [
    "Acheter à l'ouverture d'une IPO au prix le plus haut de la journée dans l'euphorie — les IPOs plongent souvent dans les premières heures.",
    "Supposer qu'une IPO médiatisée est un bon investissement — les performances post-IPO à 1 an sont souvent décevantes.",
  ],
  "bear-market": [
    "Essayer d'attraper le creux exact d'un bear market — il vaut mieux acheter en plusieurs fois lors de la reprise.",
    "Confondre une correction de 10-15% avec un vrai bear market (baisse de 20%+ depuis le sommet).",
  ],
  "bull-market": [
    "Penser que le bull market va continuer indéfiniment et négliger la gestion du risque.",
    "Attribuer toutes ses performances positives à ses compétences plutôt qu'à la marée haussière générale.",
  ],
  "swing-trading-def": [
    "Confondre le swing trading avec le day trading — les positions se gardent plusieurs jours à semaines, pas des heures.",
    "Vérifier le graphique toutes les heures au lieu de faire une analyse en soirée et laisser le trade évoluer.",
  ],
  "day-trading-def": [
    "Sous-estimer le temps plein requis — le day trading réussi demande une présence constante devant l'écran.",
    "Penser qu'il suffit de quelques semaines de pratique pour être profitable alors que la courbe d'apprentissage est de 1-2 ans minimum.",
  ],
  "scalping-def": [
    "Négliger l'impact des frais de transaction sur les petits gains visés — ils peuvent transformer un scalp profitable en perte.",
    "Trader des actifs peu liquides en scalping où le spread seul consomme la marge de profit.",
  ],
  "position-trading-def": [
    "Confondre le position trading avec l'investissement passif — le position trader suit activement sa thèse et sort si elle est invalidée.",
    "Ignorer les résultats trimestriels et l'évolution fondamentale de l'entreprise pendant la durée de la position.",
  ],
  "momentum-def": [
    "Confondre un fort momentum avec une tendance durable — le momentum peut s'épuiser rapidement après un catalyseur.",
    "Entrer sur un titre avec un momentum déjà extrême (RSI > 85) en espérant que la hausse continue.",
  ],
  "atr": [
    "Utiliser le même stop-loss en dollars pour tous les actifs au lieu d'un stop basé sur l'ATR propre à chaque actif.",
    "Ignorer que l'ATR est une mesure de volatilité, pas de direction — il ne dit pas où le prix va aller.",
  ],
  "structure-de-marche": [
    "Analyser la structure de marché uniquement sur un seul timeframe au lieu de vérifier la cohérence avec les timeframes supérieurs.",
    "Considérer que la structure est toujours valide après une nouvelle annonce majeure qui peut invalider l'analyse instantanément.",
  ],
  "divergence": [
    "Agir sur une divergence sans attendre une confirmation de l'action des prix — les divergences peuvent durer plus longtemps qu'on ne le pense.",
    "Chercher des divergences uniquement sur le RSI et ignorer d'autres indicateurs comme le MACD ou l'OBV.",
  ],
  "gap-de-prix": [
    "Supposer que tous les gaps vont toujours se refermer — certains gaps de continuation dans une forte tendance ne se referment jamais.",
    "Entrer dans un trade uniquement pour 'combler le gap' sans tenir compte du contexte global de la tendance.",
  ],
  "slippage": [
    "Utiliser des ordres au marché sur des actifs peu liquides et subir un slippage qui transforme un trade rentable en perdant.",
    "Ignorer le slippage dans ses calculs de risque/gain, surtout pour les stratégies de scalping où les marges sont minces.",
  ],
  "money-management": [
    "Ignorer le money management pendant une série gagnante et augmenter démesurément la taille des positions.",
    "Croire qu'un bon ratio de réussite compense un mauvais money management — une seule grosse perte peut effacer des semaines de gains.",
  ],
  "backtesting": [
    "Créer une stratégie en s'adaptant aux données historiques (overfitting) qui ne fonctionnera pas en conditions réelles.",
    "Oublier d'inclure les frais de transaction et le slippage dans les calculs de backtesting, surestimant la rentabilité.",
  ],
  "paper-trading": [
    "Ne pas reproduire fidèlement les conditions réelles — taille de position réaliste, respect strict des règles, inclusion des frais.",
    "Croire que la rentabilité en paper trading garantit la rentabilité en argent réel — l'absence d'émotion change tout.",
  ],
  "rotation-sectorielle-def": [
    "Confondre une rotation sectorielle de quelques jours (bruit de marché) avec un vrai changement de cycle économique.",
    "Réallouer tout le capital d'un coup au lieu de le faire progressivement pour réduire le risque de mauvais timing.",
  ],
  "penny-stock": [
    "Croire qu'un prix d'action bas implique une valorisation attractive — une penny stock peut être surévaluée.",
    "Ignorer la faible liquidité qui peut rendre impossible la sortie de position à un prix raisonnable.",
  ],
  "blue-chip": [
    "Croire qu'une blue chip est totalement sans risque — même les grandes entreprises peuvent perdre 50%+ lors d'une crise.",
    "Surpayer une blue chip en période d'euphorie et l'acheter à un P/E très élevé par rapport à son historique.",
  ],
  "market-order-limit-order": [
    "Toujours utiliser des ordres au marché sur des actifs peu liquides et subir un prix d'exécution très défavorable.",
    "Placer un ordre limite trop loin du prix actuel par souci d'économie et manquer l'entrée sur une bonne opportunité.",
  ],
  "pre-market-after-hours": [
    "Trader pendant le pre-market ou after-hours sans réaliser que le spread est beaucoup plus large et la liquidité très faible.",
    "Prendre des décisions basées sur le prix after-hours sans considérer qu'il peut diverger fortement du prix à l'ouverture.",
  ],
  "quantite-vs-prix-moyen": [
    "Moyenner à la baisse sur un titre en forte tendance baissière en espérant récupérer — augmenter le risque sur un perdant.",
    "Confondre le prix moyen pondéré avec le prix d'équilibre psychologique — le marché ignore votre prix d'achat.",
  ],
  "beta": [
    "Utiliser le bêta comme seule mesure de risque sans tenir compte du risque spécifique à l'entreprise (risque idiosyncratique).",
    "Supposer que le bêta est stable dans le temps alors qu'il peut changer significativement selon les phases de marché.",
  ],
  "capitalisation-vs-flottant": [
    "Confondre la capitalisation boursière totale avec le flottant disponible — un faible flottant crée une volatilité bien plus grande.",
    "Ignorer le flottant lors du trading de penny stocks ou de small caps où des volumes modestes peuvent faire bouger le prix de plusieurs pourcents.",
  ],
};

// ── Liens croisés vers le glossaire par chandelier ───────────────────────────
export const CANDLE_RELATED_GLOSSARY: Record<string, string[]> = {
  "marteau-hammer": ["support", "volume", "tendance-baissiere-bearish"],
  "etoile-filante-shooting-star": ["resistance", "volume", "tendance-haussiere-bullish"],
  "doji": ["marche-lateral-sideways", "rsi", "chandelier-japonais"],
  "engulfing-haussier": ["support", "volume", "momentum-def"],
  "engulfing-baissier": ["resistance", "volume", "stop-loss"],
  "etoile-du-matin-morning-star": ["tendance-baissiere-bearish", "support", "rsi"],
  "etoile-du-soir-evening-star": ["resistance", "rsi", "tendance-haussiere-bullish"],
  "trois-soldats-blancs": ["tendance-haussiere-bullish", "volume", "momentum-def"],
};

// ── Liens croisés vers le glossaire par stratégie ────────────────────────────
export const STRATEGY_RELATED_GLOSSARY: Record<string, string[]> = {
  "suivi-de-tendance": ["tendance-haussiere-bullish", "moyenne-mobile-mm-sma", "structure-de-marche"],
  "retournement-support-resistance": ["support", "resistance", "chandelier-japonais"],
  "cassure-breakout": ["cassure-breakout-def", "volume", "resistance"],
  "dollar-cost-averaging-dca": ["quantite-vs-prix-moyen", "diversification", "etf-fnb"],
  "swing-trading": ["swing-trading-def", "rapport-risque-gain-rr", "stop-loss"],
  "day-trading-intraday": ["day-trading-def", "spread", "atr"],
  "position-trading-long-terme": ["position-trading-def", "pe-ratio-per", "tendance-haussiere-bullish"],
  "momentum-trading": ["momentum-def", "rsi", "volume"],
  "retour-a-la-moyenne-mean-reversion": ["bandes-de-bollinger", "rsi", "marche-lateral-sideways"],
  "scalping": ["scalping-def", "spread", "liquidite"],
  "trading-sur-nouvelles": ["gap-de-prix", "slippage", "volume"],
  "rotation-sectorielle": ["rotation-sectorielle-def", "etf-fnb", "correlation"],
  "trading-par-paires-pairs-trading": ["correlation", "short-selling-vente-a-decouvert", "diversification"],
  "investissement-de-valeur-value-investing": ["pe-ratio-per", "dividende", "blue-chip"],
  "investissement-de-croissance-growth-investing": ["pe-ratio-per", "capitalisation-boursiere", "beta"],
  "croissance-du-dividende": ["dividende", "quantite-vs-prix-moyen", "blue-chip"],
  "pyramidage-position": ["taille-de-position", "stop-loss", "rapport-risque-gain-rr"],
  "routine-entrainement-backtesting": ["backtesting", "structure-de-marche", "money-management"],
  "routine-entrainement-papier": ["paper-trading", "taille-de-position", "money-management"],
  "grid-trading": ["marche-lateral-sideways", "levier-leverage", "atr"],
};

// ── Quiz de fin de section ────────────────────────────────────────────────────
export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const QUIZZES: Record<"bases" | "chandeliers" | "strategies" | "risques", QuizQuestion[]> = {
  bases: [
    {
      question: "Qu'est-ce qui détermine principalement le prix d'une action en bourse ?",
      options: [
        "Le gouvernement fixe un prix officiel chaque matin",
        "L'offre et la demande entre acheteurs et vendeurs",
        "Le bilan comptable de l'entreprise mis à jour chaque jour",
        "La banque centrale du pays où l'entreprise est enregistrée",
      ],
      correctIndex: 1,
      explanation: "Le prix est déterminé par l'offre et la demande : plus d'acheteurs que de vendeurs → prix monte, et vice versa.",
    },
    {
      question: "Quelle est la principale différence entre une action et un ETF (FNB) ?",
      options: [
        "Un ETF ne peut être acheté que par les institutions financières",
        "Une action est plus sûre car garantie par le gouvernement",
        "Un ETF regroupe plusieurs actifs, ce qui le rend généralement plus diversifié qu'une seule action",
        "Un ETF génère toujours un dividende mensuel contrairement aux actions",
      ],
      correctIndex: 2,
      explanation: "Un ETF contient un panier de titres (ex: XEQT.TO = ~10 000 actions mondiales), réduisant le risque de concentration sur une seule entreprise.",
    },
    {
      question: "Laquelle de ces erreurs est citée comme la plus courante chez les débutants ?",
      options: [
        "Acheter trop tôt dans la journée",
        "Investir dans des ETF au lieu d'actions individuelles",
        "Ne pas utiliser de stop-loss",
        "Trader sur les marchés canadiens au lieu des marchés américains",
      ],
      correctIndex: 2,
      explanation: "Sans stop-loss, une petite erreur peut devenir catastrophique — c'est la règle de protection #1 pour tout trader.",
    },
    {
      question: "À quelle heure le marché de Toronto (TSX) ferme-t-il ?",
      options: ["15h00 HNE", "16h00 HNE", "17h00 HNE", "Il est ouvert 24h/24"],
      correctIndex: 1,
      explanation: "Le TSX et les bourses américaines (NYSE/NASDAQ) sont ouverts de 9h30 à 16h00 HNE, du lundi au vendredi.",
    },
  ],
  chandeliers: [
    {
      question: "Que signale un Marteau (Hammer) ?",
      options: [
        "Une continuation de la tendance baissière",
        "Une indécision totale du marché",
        "Un possible retournement haussier après une baisse",
        "Un signal de vente à court terme",
      ],
      correctIndex: 2,
      explanation: "Le Marteau, avec sa longue mèche inférieure, montre que les vendeurs ont tenté de pousser le prix vers le bas mais les acheteurs ont repris le contrôle.",
    },
    {
      question: "Quel est le principal risque d'utiliser un Doji comme signal d'entrée seul ?",
      options: [
        "Le Doji est un signal exclusivement baissier",
        "Le Doji ne donne pas de direction — il faut attendre la bougie suivante pour confirmer",
        "Le Doji n'est valide que sur le marché des cryptomonnaies",
        "Le Doji indique toujours une manipulation des prix par les institutions",
      ],
      correctIndex: 1,
      explanation: "Le Doji signale l'indécision, pas une direction. Il faut toujours attendre la bougie suivante pour confirmer la direction probable.",
    },
    {
      question: "Pour qu'un Engulfing haussier soit fiable, où doit-il apparaître idéalement ?",
      options: [
        "Au milieu d'une tendance haussière bien établie",
        "N'importe où sur le graphique",
        "Au bas d'une tendance baissière",
        "Uniquement sur des graphiques en timeframe mensuel",
      ],
      correctIndex: 2,
      explanation: "L'Engulfing haussier est très fiable au bas d'une tendance baissière — la grande bougie verte qui engloutit la rouge signale que les acheteurs ont pris le contrôle.",
    },
    {
      question: "L'Étoile du matin (Morning Star) est composée de combien de bougies ?",
      options: ["1 bougie", "2 bougies", "3 bougies", "5 bougies"],
      correctIndex: 2,
      explanation: "L'Étoile du matin est un pattern de 3 bougies : une grande rouge, une petite (indécision), puis une grande verte qui confirme le retournement haussier.",
    },
  ],
  strategies: [
    {
      question: "Quelle stratégie consiste à investir la même somme à intervalles réguliers peu importe le prix ?",
      options: [
        "Swing Trading",
        "Dollar Cost Averaging (DCA)",
        "Scalping",
        "Trading sur nouvelles",
      ],
      correctIndex: 1,
      explanation: "Le DCA élimine le stress du 'bon moment' en investissant un montant fixe chaque mois — idéal pour les débutants sur des ETF diversifiés.",
    },
    {
      question: "Quelle est la principale limite du suivi de tendance (Trend Following) ?",
      options: [
        "Il nécessite beaucoup de temps devant l'écran",
        "Il est très peu efficace sur les marchés en forte tendance",
        "Il est peu efficace sur les marchés latéraux sans direction claire",
        "Il exige un capital minimum de 50 000 $",
      ],
      correctIndex: 2,
      explanation: "Le suivi de tendance génère de nombreux faux signaux quand le marché oscille sans direction — il faut d'abord confirmer qu'une vraie tendance est en place.",
    },
    {
      question: "Lors d'une stratégie de Cassure (Breakout), quel élément est indispensable à vérifier ?",
      options: [
        "Que le RSI soit en dessous de 30",
        "Que le volume de la bougie de cassure soit supérieur à la moyenne",
        "Que l'entreprise ait annoncé de bons résultats trimestriels",
        "Que la cassure se produise un lundi matin",
      ],
      correctIndex: 1,
      explanation: "Un breakout sans volume élevé est souvent une fausse cassure — le volume confirme que de vrais acheteurs/vendeurs participent au mouvement.",
    },
    {
      question: "Quelle stratégie est décrite comme particulièrement adaptée à quelqu'un qui a un horaire de travail normal et ne peut pas surveiller l'écran toute la journée ?",
      options: [
        "Scalping",
        "Day Trading Intraday",
        "Swing Trading",
        "Grid Trading",
      ],
      correctIndex: 2,
      explanation: "Le Swing Trading implique de garder une position 3 à 15 jours en revérifiant chaque soir — compatible avec un emploi à temps plein.",
    },
  ],
  risques: [
    {
      question: "Selon la règle des 1-2%, avec un capital de 5 000 $, quel est le risque maximum par trade ?",
      options: ["500 $", "50 à 100 $", "1 000 $", "250 $"],
      correctIndex: 1,
      explanation: "1% de 5 000 $ = 50 $, et 2% = 100 $. Cette règle permet de survivre à 10 mauvaises trades consécutives sans perdre plus de 10-20% du capital.",
    },
    {
      question: "Qu'est-ce que le 'revenge trading' ?",
      options: [
        "Trader contre la tendance principale du marché",
        "Prendre des trades impulsifs après une perte pour tenter de récupérer rapidement",
        "Copier les trades d'un autre trader qui vous a devancé",
        "Vendre à découvert une action d'un concurrent",
      ],
      correctIndex: 1,
      explanation: "Le revenge trading — trader impulsivement après une perte — est l'une des erreurs psychologiques les plus coûteuses car la discipline est compromise.",
    },
    {
      question: "Si votre prix d'entrée est 100 $, votre stop-loss à 95 $ et votre objectif à 115 $, quel est votre rapport risque/gain (R:R) ?",
      options: ["1:1", "1:2", "3:1", "1:3"],
      correctIndex: 2,
      explanation: "Risque = 5 $, Gain potentiel = 15 $. R:R = 15/5 = 3:1 — excellent. Il faut toujours viser un minimum de 2:1 avant d'entrer dans un trade.",
    },
    {
      question: "Où doit idéalement être placé un stop-loss pour être logique et efficace ?",
      options: [
        "Exactement 10% sous le prix d'achat, peu importe le graphique",
        "À un niveau qui minimise la perte à zéro dollar",
        "Juste en dessous d'un support identifié ou de la mèche basse du chandelier d'entrée",
        "Au même niveau pour tous les trades afin de simplifier la gestion",
      ],
      correctIndex: 2,
      explanation: "Un stop-loss logique se place sous un support technique ou la mèche basse — un niveau où, si atteint, votre thèse de départ est clairement invalidée.",
    },
  ],
};
