import { useState } from "react";
import { BookOpen, TrendingUp, BarChart2, ShieldAlert, Lightbulb, ChevronDown, ChevronUp, Search } from "lucide-react";

type Tab = "bases" | "chandeliers" | "strategies" | "risques" | "glossaire";

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "bases", label: "Bases du trading", icon: TrendingUp },
  { id: "chandeliers", label: "Chandeliers japonais", icon: BarChart2 },
  { id: "strategies", label: "Stratégies débutant", icon: Lightbulb },
  { id: "risques", label: "Gestion des risques", icon: ShieldAlert },
  { id: "glossaire", label: "Glossaire complet", icon: BookOpen },
];

// ── Chandeliers ──────────────────────────────────────────────────────────────
interface Candle {
  name: string;
  signal: "haussier" | "baissier" | "neutre";
  description: string;
  howToUse: string;
  svg: string;
}

const CANDLES: Candle[] = [
  {
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

// ── Stratégies ───────────────────────────────────────────────────────────────
const STRATEGIES = [
  {
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

// ── Glossaire ────────────────────────────────────────────────────────────────
const GLOSSAIRE: { term: string; definition: string; category: string }[] = [
  { term: "Action (Stock)", definition: "Part de propriété d'une entreprise cotée en bourse. En achetant une action AAPL, vous devenez copropriétaire d'Apple.", category: "Bases" },
  { term: "ETF / FNB", definition: "Fonds négocié en bourse qui regroupe plusieurs actifs (ex: les 500 plus grandes entreprises US pour le S&P500 ETF). Moins risqué qu'une seule action.", category: "Bases" },
  { term: "Indice boursier", definition: "Mesure de la performance d'un groupe d'actions (ex: S&P500 = 500 plus grandes entreprises US). Thermomètre de la santé du marché.", category: "Bases" },
  { term: "Capitalisation boursière", definition: "Valeur totale d'une entreprise en bourse = Prix de l'action × Nombre d'actions. Apple : ~3 000 milliards $.", category: "Bases" },
  { term: "Volume", definition: "Nombre d'actions ou de contrats échangés sur une période. Un volume élevé lors d'un mouvement de prix le rend plus significatif.", category: "Bases" },
  { term: "Spread", definition: "Différence entre le prix d'achat (ask) et le prix de vente (bid). C'est le coût invisible de chaque transaction.", category: "Bases" },
  { term: "Dividende", definition: "Portion des bénéfices d'une entreprise versée aux actionnaires, généralement trimestriellement.", category: "Bases" },
  { term: "Liquidité", definition: "Facilité à acheter ou vendre un actif sans impacter son prix. Apple est très liquide ; une micro-cap canadienne l'est beaucoup moins.", category: "Bases" },
  { term: "Tendance haussière (Bullish)", definition: "Marché ou actif qui monte sur la durée. Série de plus hauts et plus bas ascendants.", category: "Tendances" },
  { term: "Tendance baissière (Bearish)", definition: "Marché ou actif qui descend sur la durée. Série de plus hauts et plus bas descendants.", category: "Tendances" },
  { term: "Marché latéral (Sideways)", definition: "Prix qui oscille dans une plage sans tendance claire. Difficile pour les traders de tendance.", category: "Tendances" },
  { term: "Support", definition: "Niveau de prix où le marché a tendance à rebondir car les acheteurs sont plus nombreux que les vendeurs. Plancher du prix.", category: "Niveaux" },
  { term: "Résistance", definition: "Niveau de prix difficile à franchir à la hausse car les vendeurs dominent. Plafond du prix.", category: "Niveaux" },
  { term: "Cassure (Breakout)", definition: "Franchissement d'un support ou d'une résistance avec du volume. Souvent suivi d'un fort mouvement.", category: "Niveaux" },
  { term: "Retracement de Fibonacci", definition: "Niveaux de pullback courants après un mouvement (23,6%, 38,2%, 50%, 61,8%). Les traders y placent leurs ordres.", category: "Niveaux" },
  { term: "RSI (Relative Strength Index)", definition: "Indicateur de 0 à 100. En dessous de 30 : survente (rebond probable). Au-dessus de 70 : surachat (repli possible).", category: "Indicateurs" },
  { term: "MACD", definition: "Indicateur de momentum. Croisement haussier = signal d'achat potentiel. Croisement baissier = signal de vente.", category: "Indicateurs" },
  { term: "Moyenne mobile (MM/SMA)", definition: "Moyenne des prix sur N jours. Lisse les fluctuations et montre la tendance. MM200 = tendance long terme.", category: "Indicateurs" },
  { term: "Bandes de Bollinger", definition: "Enveloppe autour du prix basée sur l'écart-type. Le prix touche la bande basse → rebond probable. Bande haute → résistance.", category: "Indicateurs" },
  { term: "Volume on Balance (OBV)", definition: "Cumule le volume selon la direction du prix. Si le prix monte avec un OBV croissant, la hausse est confirmée.", category: "Indicateurs" },
  { term: "Stop-loss", definition: "Ordre de vente automatique si le prix tombe à un niveau prédéfini. Protège contre les grosses pertes.", category: "Gestion des risques" },
  { term: "Take profit", definition: "Ordre de vente automatique si le prix atteint votre objectif de gain.", category: "Gestion des risques" },
  { term: "Rapport risque/gain (R:R)", definition: "Si vous risquez 100 $ pour gagner 300 $, votre R:R est 1:3. Visez toujours un minimum de 1:2.", category: "Gestion des risques" },
  { term: "Taille de position", definition: "Montant investi dans un seul actif. Règle commune : ne jamais risquer plus de 1-2% de son capital sur une seule trade.", category: "Gestion des risques" },
  { term: "Drawdown", definition: "Baisse maximale depuis un pic. Si votre portefeuille passe de 10 000 $ à 8 000 $, le drawdown est 20%.", category: "Gestion des risques" },
  { term: "Levier (Leverage)", definition: "Emprunter pour multiplier les gains potentiels — et les pertes. Déconseillé aux débutants. 10x levier = 10x le risque.", category: "Gestion des risques" },
  { term: "Diversification", definition: "Répartir son capital sur plusieurs actifs non-corrélés pour réduire le risque global.", category: "Gestion des risques" },
  { term: "Corrélation", definition: "Mesure si deux actifs bougent ensemble (+1) ou à l'opposé (-1). Un portefeuille bien diversifié a des actifs peu corrélés.", category: "Avancé" },
  { term: "P/E Ratio (PER)", definition: "Prix / Bénéfice par action. Mesure si une action est chère par rapport à ses bénéfices. PER de 15 = normal, 50+ = cher.", category: "Fondamentaux" },
  { term: "Short selling / Vente à découvert", definition: "Vendre un actif qu'on ne possède pas en espérant le racheter moins cher. Risque illimité si le prix monte.", category: "Avancé" },
  { term: "Chandelier japonais", definition: "Représentation graphique d'un prix sur une période donnée : ouverture, clôture, haut et bas. Inventé par les marchands japonais de riz au XVIIe siècle.", category: "Bases" },
  { term: "Bougie verte / Bougie rouge", definition: "Verte = clôture au-dessus de l'ouverture (prix a monté). Rouge = clôture en dessous (prix a baissé).", category: "Bases" },
  { term: "Mèche (Wick/Shadow)", definition: "Ligne fine au-dessus ou en dessous du corps d'une bougie. Représente les extrêmes atteints pendant la période.", category: "Bases" },
  { term: "IPO (Introduction en bourse)", definition: "Première mise sur le marché des actions d'une entreprise. Souvent volatile dans les premiers jours.", category: "Événements" },
  { term: "Bear market", definition: "Marché en baisse de plus de 20% depuis un sommet. Souvent lié à des récessions ou crises.", category: "Tendances" },
  { term: "Bull market", definition: "Marché en hausse de plus de 20% depuis un creux. Période de confiance et d'optimisme.", category: "Tendances" },
];

// ── Accordion ────────────────────────────────────────────────────────────────
function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-left hover:bg-muted/50 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Tab components ────────────────────────────────────────────────────────────

function BasesTab() {
  return (
    <div className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-sm font-semibold text-primary mb-1">🎯 Par où commencer ?</p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Le trading est l'achat et la vente d'actifs financiers pour générer un profit. Cette app vous donne tous les outils — mais la clé, c'est de comprendre <strong>pourquoi</strong> les prix bougent avant de chercher <strong>comment</strong> en profiter.
        </p>
      </div>

      <Accordion title="📈 Comment fonctionne un marché boursier ?" defaultOpen>
        <div className="space-y-2 text-sm text-foreground/80 leading-relaxed mt-2">
          <p>Un marché boursier est simplement un endroit où les gens s'échangent des parts d'entreprises (actions). Le prix d'une action est déterminé par <strong>l'offre et la demande</strong> :</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Plus de gens veulent acheter → prix monte</li>
            <li>Plus de gens veulent vendre → prix descend</li>
            <li>Les nouvelles, bénéfices, événements mondiaux influencent cette demande</li>
          </ul>
          <p className="mt-2">Les marchés canadiens (TSX) ferment de 9h30 à 16h00 HNE. Les marchés US ferment aux mêmes heures.</p>
        </div>
      </Accordion>

      <Accordion title="🕯️ Comment lire un graphique de chandeliers ?">
        <div className="space-y-2 text-sm text-foreground/80 leading-relaxed mt-2">
          <p>Chaque chandelier représente une période (1 heure, 1 jour, etc.) et montre 4 informations :</p>
          <div className="bg-muted rounded-lg p-3 my-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>🟢 <strong>Ouverture</strong> : prix au début de la période</div>
              <div>🔴 <strong>Clôture</strong> : prix à la fin</div>
              <div>⬆️ <strong>Haut</strong> : plus haut atteint (mèche haute)</div>
              <div>⬇️ <strong>Bas</strong> : plus bas atteint (mèche basse)</div>
            </div>
          </div>
          <p>Une bougie <span className="text-emerald-500 font-semibold">verte</span> = clôture &gt; ouverture (le prix a monté). Une bougie <span className="text-red-500 font-semibold">rouge</span> = clôture &lt; ouverture.</p>
        </div>
      </Accordion>

      <Accordion title="📊 Quelle est la différence entre une action, un ETF, et une crypto ?">
        <div className="space-y-3 text-sm text-foreground/80 mt-2">
          <div className="flex gap-3 bg-muted/40 rounded-lg p-3">
            <span className="text-lg">🏢</span>
            <div><strong>Action</strong> : Part d'une entreprise unique. Plus risqué (une seule société), mais potentiel de gain élevé. Ex : AAPL, SHOP.TO.</div>
          </div>
          <div className="flex gap-3 bg-muted/40 rounded-lg p-3">
            <span className="text-lg">🧺</span>
            <div><strong>ETF/FNB</strong> : Panier de nombreuses actions. Moins risqué car diversifié. XEQT.TO = 10 000 actions mondiales dans un seul produit.</div>
          </div>
          <div className="flex gap-3 bg-muted/40 rounded-lg p-3">
            <span className="text-lg">🪙</span>
            <div><strong>Crypto</strong> : Actif numérique très volatile. Bitcoin peut bouger ±10% en une journée. Réservez une petite partie du portefeuille.</div>
          </div>
        </div>
      </Accordion>

      <Accordion title="⏰ Quand les marchés sont-ils ouverts ?">
        <div className="space-y-2 text-sm mt-2">
          {[
            { flag: "🇨🇦", name: "Bourse de Toronto (TSX)", hours: "9h30 – 16h00 HNE (lun–ven)" },
            { flag: "🇺🇸", name: "NYSE / NASDAQ", hours: "9h30 – 16h00 HNE (lun–ven)" },
            { flag: "🇬🇧", name: "Bourse de Londres (LSE)", hours: "8h00 – 16h30 GMT" },
            { flag: "🇩🇪", name: "Bourse de Francfort (DAX)", hours: "9h00 – 17h30 CET" },
            { flag: "🇯🇵", name: "Bourse de Tokyo (Nikkei)", hours: "9h00 – 15h30 JST (fermé 11h30–12h30)" },
            { flag: "🪙", name: "Cryptomonnaies", hours: "24h/24, 7j/7" },
          ].map((m) => (
            <div key={m.name} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-2">
                <span>{m.flag}</span>
                <span className="font-medium text-xs">{m.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{m.hours}</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-2 italic">En dehors des heures, les prix dans cette app peuvent afficher la dernière clôture ou des échanges pre/after-market.</p>
        </div>
      </Accordion>

      <Accordion title="❌ Les 5 erreurs les plus communes des débutants">
        <div className="space-y-2 mt-2">
          {[
            { no: "1", error: "FOMO — acheter parce que tout le monde achète", fix: "Analysez toujours avant d'agir. Si vous avez raté une hausse, il y en aura d'autres." },
            { no: "2", error: "Pas de stop-loss", fix: "Chaque position doit avoir un niveau de perte maximum. Sans stop, une petite erreur devient une catastrophe." },
            { no: "3", error: "Sur-diversification (trop d'actifs)", fix: "Mieux vaut 5 positions bien comprises que 20 positions mal suivies." },
            { no: "4", error: "Trader contre la tendance", fix: "La tendance est votre amie. Ne pariez pas contre le marché sans signal clair de retournement." },
            { no: "5", error: "Investir de l'argent qu'on ne peut pas se permettre de perdre", fix: "N'investissez que l'argent que vous seriez à l'aise de perdre entièrement dans le pire scénario." },
          ].map((e) => (
            <div key={e.no} className="flex gap-3 bg-red-500/5 border border-red-500/15 rounded-lg p-3">
              <span className="text-red-500 font-bold text-sm shrink-0">#{e.no}</span>
              <div>
                <div className="text-sm font-semibold text-foreground">{e.error}</div>
                <div className="text-xs text-muted-foreground mt-0.5">✅ {e.fix}</div>
              </div>
            </div>
          ))}
        </div>
      </Accordion>
    </div>
  );
}

function ChandeliersTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Les chandeliers japonais sont le langage visuel du marché. Chaque pattern raconte l'histoire de la lutte entre acheteurs et vendeurs sur une période donnée. Apprenez à les lire et vous aurez un avantage réel.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CANDLES.map((c) => (
          <div key={c.name} className={`border rounded-xl p-4 ${
            c.signal === "haussier" ? "border-emerald-500/20 bg-emerald-500/5" :
            c.signal === "baissier" ? "border-red-500/20 bg-red-500/5" :
            "border-border bg-muted/20"
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-16 shrink-0 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: c.svg }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-bold">{c.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                    c.signal === "haussier" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                    c.signal === "baissier" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{c.signal === "haussier" ? "🟢 Haussier" : c.signal === "baissier" ? "🔴 Baissier" : "⚪ Neutre"}</span>
                </div>
                <p className="text-xs text-foreground/70 leading-relaxed mb-1.5">{c.description}</p>
                <div className="bg-background/60 rounded-lg px-2 py-1.5">
                  <p className="text-xs font-medium text-primary">💡 Comment l'utiliser :</p>
                  <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{c.howToUse}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StrategiesTab() {
  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm">
        <strong>⚠️ Important :</strong> Aucune stratégie ne fonctionne 100% du temps. L'objectif est d'avoir une <strong>espérance mathématique positive</strong> sur le long terme — gagner plus que vous ne perdez en moyenne.
      </div>
      {STRATEGIES.map((s) => (
        <div key={s.name} className={`border rounded-xl p-5 ${s.bg} border-current/20`}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className={`font-bold text-base ${s.color}`}>{s.name}</h3>
            <span className="text-xs bg-background/60 px-2 py-1 rounded-full font-medium shrink-0">{s.level}</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed mb-3">{s.description}</p>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Étapes</p>
            <div className="space-y-1.5">
              {s.steps.map((step, i) => (
                <div key={i} className="flex gap-2.5 text-sm">
                  <span className={`${s.color} font-bold shrink-0`}>{i + 1}.</span>
                  <span className="text-foreground/80 leading-relaxed">{step}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-emerald-500/10 rounded-lg p-2">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">✅ Avantages</span>
              <p className="text-foreground/70 mt-0.5">{s.pros}</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-2">
              <span className="font-semibold text-red-600 dark:text-red-400">⚠️ Limites</span>
              <p className="text-foreground/70 mt-0.5">{s.cons}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RisquesTab() {
  return (
    <div className="space-y-4">
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-1">La règle n°1 du trading</p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          <strong>Ne perdez jamais plus que vous ne pouvez vous permettre.</strong> Même les meilleurs traders au monde perdent régulièrement. La différence, c'est qu'ils contrôlent leurs pertes pour que les gains les dépassent sur le long terme.
        </p>
      </div>

      <Accordion title="📐 La règle des 1-2% par position" defaultOpen>
        <div className="text-sm text-foreground/80 leading-relaxed mt-2 space-y-2">
          <p>Ne risquez jamais plus de <strong>1 à 2% de votre capital total</strong> sur une seule trade. Exemple :</p>
          <div className="bg-muted rounded-lg p-3 text-xs space-y-1">
            <div>Capital total : 5 000 $</div>
            <div>Risque max par trade (1%) : <strong className="text-emerald-500">50 $</strong></div>
            <div>Stop-loss à 5% sous le prix d'entrée</div>
            <div>Taille de position : 50 ÷ 5% = <strong className="text-primary">1 000 $</strong></div>
          </div>
          <p>Avec cette règle, même 10 mauvaises trades consécutives ne vous coûtent que 10% de votre capital.</p>
        </div>
      </Accordion>

      <Accordion title="🛡️ Comment placer un stop-loss efficace">
        <div className="text-sm text-foreground/80 leading-relaxed mt-2 space-y-2">
          <p>Votre stop-loss doit être placé à un niveau <strong>logique</strong>, pas arbitraire :</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Juste en dessous d'un support identifié</li>
            <li>Sous la mèche basse du chandelier d'entrée</li>
            <li>Sous la MM20 ou MM50 si vous tradez la tendance</li>
          </ul>
          <p>Ne jamais déplacer son stop-loss <em>vers le bas</em> pour éviter d'être stoppé. C'est la cause #1 des grosses pertes.</p>
        </div>
      </Accordion>

      <Accordion title="⚖️ Calculer son rapport risque/gain (R:R)">
        <div className="text-sm text-foreground/80 leading-relaxed mt-2 space-y-2">
          <p>Avant d'entrer dans une trade, calculez toujours :</p>
          <div className="bg-muted rounded-lg p-3 text-xs space-y-1">
            <div>Prix d'entrée : 100 $</div>
            <div>Stop-loss : 95 $ → Risque = <strong className="text-red-500">5 $</strong></div>
            <div>Objectif : 115 $ → Gain potentiel = <strong className="text-emerald-500">15 $</strong></div>
            <div>R:R = 15/5 = <strong className="text-primary">3:1</strong> ✅ Excellent</div>
          </div>
          <p>Visez toujours un minimum de <strong>2:1</strong> (gagner au moins 2 $ pour chaque 1 $ risqué).</p>
        </div>
      </Accordion>

      <Accordion title="🧠 Psychologie du trading">
        <div className="text-sm text-foreground/80 leading-relaxed mt-2 space-y-3">
          {[
            { title: "FOMO (Fear Of Missing Out)", desc: "Peur de rater une opportunité. Pousse à acheter au plus haut, souvent juste avant un retournement." },
            { title: "Revenge trading", desc: "Après une perte, on prend des trades impulsifs pour 'récupérer'. C'est l'erreur la plus coûteuse." },
            { title: "Confirmation bias", desc: "On cherche uniquement les informations qui confirment ce qu'on veut croire. Cherchez activement les arguments contre votre position." },
            { title: "Overconfidence", desc: "Après quelques succès, on prend trop de risques. Restez discipliné même quand tout va bien." },
          ].map((p) => (
            <div key={p.title} className="border-l-2 border-primary/40 pl-3">
              <div className="font-semibold text-foreground">{p.title}</div>
              <div className="text-muted-foreground text-xs mt-0.5">{p.desc}</div>
            </div>
          ))}
        </div>
      </Accordion>
    </div>
  );
}

function GlossaireTab() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Tous");

  const categories = ["Tous", ...Array.from(new Set(GLOSSAIRE.map((g) => g.category)))];
  const filtered = GLOSSAIRE.filter((g) => {
    const matchSearch = !search || g.term.toLowerCase().includes(search.toLowerCase()) || g.definition.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "Tous" || g.category === catFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-card border border-card-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Rechercher un terme..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${catFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-0 bg-card border border-card-border rounded-xl overflow-hidden divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-sm text-center text-muted-foreground">Aucun terme trouvé</div>
        ) : (
          filtered.map((g) => (
            <div key={g.term} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-foreground">{g.term}</span>
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{g.category}</span>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed">{g.definition}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Learn() {
  const [tab, setTab] = useState<Tab>("bases");

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Apprendre à trader</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Guide complet pour débutants — des bases aux stratégies avancées, en français</p>
      </div>

      <div className="flex flex-wrap gap-1 mb-6 border-b border-border pb-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "bases" && <BasesTab />}
      {tab === "chandeliers" && <ChandeliersTab />}
      {tab === "strategies" && <StrategiesTab />}
      {tab === "risques" && <RisquesTab />}
      {tab === "glossaire" && <GlossaireTab />}
    </div>
  );
}
