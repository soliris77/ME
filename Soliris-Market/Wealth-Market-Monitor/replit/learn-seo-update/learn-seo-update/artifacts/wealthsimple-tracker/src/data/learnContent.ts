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
];
