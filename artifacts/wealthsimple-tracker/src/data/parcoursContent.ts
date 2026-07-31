// Parcours guidé « Apprendre à trader » — leçons courtes en français, chacune
// avec un quiz (3–5 questions) et un lien direct vers le vrai outil de l'app
// pour pratiquer immédiatement. La progression est sauvegardée côté serveur
// dans la table learn_progress avec sectionId = `lecon-<slug>`.
import type { QuizQuestion } from "./learnContent";

export interface LessonSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  example?: string[]; // lignes affichées en style "console" / calcul
}

export interface LessonPractice {
  label: string;        // texte du bouton « Pratiquer »
  description: string;  // ce que l'utilisateur va faire concrètement
  href?: string;        // route interne de l'outil réel
  action?: "calculator"; // ouvre le calculateur de taille de position (modal)
}

export interface Lesson {
  slug: string;
  title: string;
  emoji: string;
  minutes: number; // durée estimée de lecture
  summary: string;
  sections: LessonSection[];
  quiz: QuizQuestion[];
  practice: LessonPractice;
}

/** Identifiant de progression en DB pour une leçon du parcours. */
export const lessonSectionId = (slug: string) => `lecon-${slug}`;

export const LESSONS: Lesson[] = [
  {
    slug: "plan-de-trade",
    title: "Le plan de trade",
    emoji: "🗺️",
    minutes: 4,
    summary: "Avant chaque achat : pourquoi j'entre, où je sors si ça monte, où je sors si ça baisse.",
    sections: [
      {
        heading: "Pourquoi un plan avant d'acheter ?",
        paragraphs: [
          "Un trade sans plan, c'est un pari. Un trade avec plan, c'est une décision. Le plan se rédige AVANT d'acheter, quand vous êtes calme — pas pendant que le prix bouge et que l'émotion parle.",
          "Un bon plan tient en trois questions :",
        ],
        bullets: [
          "Pourquoi j'entre ? (le signal : cassure, rebond sur support, tendance…)",
          "Où je sors si j'ai raison ? (objectif de gain, niveau de résistance)",
          "Où je sors si j'ai tort ? (stop-loss — décidé à l'avance, jamais déplacé vers le bas)",
        ],
      },
      {
        heading: "Le plan écrit vous protège de vous-même",
        paragraphs: [
          "Quand la position est ouverte, votre cerveau cherche des raisons de garder une position perdante (« ça va remonter ») ou de vendre trop tôt une gagnante. Le plan écrit avant l'entrée est votre référence objective : si le prix touche le stop, on sort. Point.",
          "Dans cette app, les alertes de prix jouent ce rôle : posez une alerte sur votre niveau de sortie ET sur votre stop dès l'entrée. Vous serez prévenu au bon moment, sans surveiller l'écran toute la journée.",
        ],
      },
    ],
    quiz: [
      {
        question: "Quand doit-on rédiger son plan de trade ?",
        options: ["Après l'achat, une fois la position ouverte", "Avant d'acheter, quand on est calme", "Seulement si la position devient perdante"],
        correctIndex: 1,
        explanation: "Le plan se rédige avant l'entrée, à froid. Une fois la position ouverte, l'émotion fausse le jugement.",
      },
      {
        question: "Quelles sont les 3 questions d'un plan de trade complet ?",
        options: [
          "Pourquoi j'entre, où je sors si ça monte, où je sors si ça baisse",
          "Combien je peux gagner, qui d'autre achète, quand revendre au sommet",
          "Quel est le prix le plus bas, le plus haut, et le volume du jour",
        ],
        correctIndex: 0,
        explanation: "Signal d'entrée + objectif de sortie + stop-loss : les trois piliers de tout plan.",
      },
      {
        question: "Le prix touche votre stop-loss prévu au plan. Que faites-vous ?",
        options: ["Je déplace le stop plus bas pour laisser une chance", "Je sors, comme prévu au plan", "J'achète davantage pour moyenner à la baisse"],
        correctIndex: 1,
        explanation: "Le plan décidé à froid prime sur l'émotion du moment. Déplacer son stop vers le bas est la cause n°1 des grosses pertes.",
      },
    ],
    practice: {
      label: "Créer mes alertes de sortie",
      description: "Posez une alerte sur votre objectif de gain et une autre sur votre niveau de stop pour un titre que vous suivez.",
      href: "/alerts",
    },
  },
  {
    slug: "taille-de-position",
    title: "La taille de position (règle des 1-2 %)",
    emoji: "📐",
    minutes: 5,
    summary: "Ne jamais risquer plus de 1 à 2 % du capital sur un seul trade — et calculer combien acheter.",
    sections: [
      {
        heading: "La règle qui garde en vie",
        paragraphs: [
          "La question n'est pas « combien je peux gagner ? » mais « combien j'accepte de perdre si j'ai tort ? ». La règle : ne risquez jamais plus de 1 à 2 % de votre capital total sur un seul trade.",
          "Avec 1 % de risque par trade, il faudrait environ 100 mauvaises décisions consécutives pour vider le compte. Avec 20 % de risque par trade, 5 suffisent.",
        ],
      },
      {
        heading: "Le calcul en pratique",
        paragraphs: ["La taille de position découle du risque accepté et de la distance du stop-loss :"],
        example: [
          "Capital : 5 000 $",
          "Risque max (1 %) : 50 $",
          "Entrée : 20 $ / Stop-loss : 19 $ → risque de 1 $ par action",
          "Taille : 50 ÷ 1 = 50 actions (1 000 $ investis)",
        ],
        bullets: [
          "Stop proche → position plus grande possible (le risque par action est petit)",
          "Stop éloigné → position plus petite obligatoire",
          "Le montant investi n'est PAS le montant risqué : ici on investit 1 000 $ mais on ne risque que 50 $",
        ],
      },
    ],
    quiz: [
      {
        question: "Capital de 10 000 $, règle du 1 %. Quel est le risque maximum par trade ?",
        options: ["1 000 $", "100 $", "10 $"],
        correctIndex: 1,
        explanation: "1 % de 10 000 $ = 100 $. C'est la perte maximale acceptée si le stop est touché.",
      },
      {
        question: "Entrée à 50 $, stop à 45 $, risque accepté de 100 $. Combien d'actions acheter ?",
        options: ["100 actions", "20 actions", "2 actions"],
        correctIndex: 1,
        explanation: "Risque par action = 50 − 45 = 5 $. 100 $ ÷ 5 $ = 20 actions.",
      },
      {
        question: "Votre stop-loss est très éloigné du prix d'entrée. Conséquence sur la taille ?",
        options: ["La position doit être plus petite", "La position peut être plus grande", "Aucun impact, la taille est fixe"],
        correctIndex: 0,
        explanation: "Plus le stop est loin, plus le risque par action est grand — il faut donc moins d'actions pour rester dans le budget de risque.",
      },
      {
        question: "Vous investissez 2 000 $ avec un stop à −3 %. Combien risquez-vous réellement ?",
        options: ["2 000 $", "60 $", "3 $"],
        correctIndex: 1,
        explanation: "Le montant risqué = montant investi × distance du stop : 2 000 × 3 % = 60 $. Investi ≠ risqué.",
      },
    ],
    practice: {
      label: "Ouvrir le calculateur de position",
      description: "Entrez votre capital, votre % de risque et votre stop : le calculateur vous donne le nombre d'actions à acheter.",
      action: "calculator",
    },
  },
  {
    slug: "stop-loss",
    title: "Le stop-loss",
    emoji: "🛡️",
    minutes: 4,
    summary: "Où placer sa sortie de secours, et pourquoi on ne la déplace jamais vers le bas.",
    sections: [
      {
        heading: "Une sortie de secours, pas une punition",
        paragraphs: [
          "Le stop-loss est un ordre de vente automatique déclenché si le prix descend sous un niveau choisi. Il transforme une perte potentiellement catastrophique en petite perte contrôlée.",
          "Un stop se place à un niveau logique, pas arbitraire :",
        ],
        bullets: [
          "Juste sous un support identifié (plus bas récent)",
          "Sous la mèche basse du chandelier d'entrée",
          "Sous une moyenne mobile (MM20/MM50) si vous suivez la tendance",
        ],
      },
      {
        heading: "Les deux erreurs mortelles",
        paragraphs: [
          "1. Trader sans stop : « je surveillerai » ne fonctionne pas — une mauvaise nouvelle pendant la nuit, un gap à l'ouverture, et la perte dépasse tout ce qui était acceptable.",
          "2. Déplacer le stop vers le bas : quand le prix approche du stop, la tentation de le descendre « pour laisser une chance » est énorme. C'est exactement comme ça qu'une perte de 2 % devient une perte de 30 %.",
          "Dans cette app, la page Courtier permet de poser un vrai ordre stop de protection sur vos positions — le serveur vérifie même que le stop est bien sous le prix actuel.",
        ],
      },
    ],
    quiz: [
      {
        question: "À quoi sert un stop-loss ?",
        options: ["À garantir un profit", "À limiter la perte maximale d'une position", "À acheter automatiquement plus bas"],
        correctIndex: 1,
        explanation: "Le stop-loss vend automatiquement si le prix descend sous votre niveau : la perte reste petite et contrôlée.",
      },
      {
        question: "Où placer un stop-loss logique ?",
        options: ["À exactement −10 %, toujours", "Juste sous un support ou la mèche basse d'entrée", "Au prix d'achat, pour ne jamais perdre"],
        correctIndex: 1,
        explanation: "Le stop se place sous un niveau technique logique. Un % arbitraire ignore la structure du marché.",
      },
      {
        question: "Le prix s'approche de votre stop. Vous êtes tenté de le baisser. Verdict ?",
        options: ["Bonne idée, ça laisse respirer le titre", "Jamais : c'est la cause n°1 des grosses pertes", "Acceptable une fois sur deux"],
        correctIndex: 1,
        explanation: "Déplacer un stop vers le bas revient à annuler sa protection au pire moment. Le plan initial prime.",
      },
    ],
    practice: {
      label: "Poser un stop de protection",
      description: "Sur la page Courtier, ajoutez un ordre stop de protection sous une de vos positions.",
      href: "/courtier",
    },
  },
  {
    slug: "risque-rendement",
    title: "Le ratio risque/rendement (R:R)",
    emoji: "⚖️",
    minutes: 4,
    summary: "Ne prendre que les trades où le gain potentiel vaut au moins 2× le risque.",
    sections: [
      {
        heading: "Le filtre avant chaque trade",
        paragraphs: [
          "Le ratio risque/rendement compare ce que vous pouvez perdre (entrée → stop) à ce que vous pouvez gagner (entrée → objectif).",
        ],
        example: [
          "Entrée : 100 $",
          "Stop : 95 $ → risque = 5 $",
          "Objectif : 115 $ → gain potentiel = 15 $",
          "R:R = 15 ÷ 5 = 3:1 ✅",
        ],
        bullets: [
          "Minimum recommandé : 2:1 (gagner au moins 2 $ pour chaque 1 $ risqué)",
          "Si le R:R est sous 2:1, on laisse passer le trade — il y en aura d'autres",
        ],
      },
      {
        heading: "Pourquoi ça change tout",
        paragraphs: [
          "Avec un R:R de 2:1, vous pouvez vous tromper une fois sur deux et rester gagnant : 5 trades gagnants à +2 et 5 perdants à −1 donnent +5. Le R:R rend la rentabilité possible SANS avoir raison souvent.",
          "C'est l'inverse de l'intuition du débutant, qui cherche à « avoir raison » à chaque trade. Le pro cherche des trades asymétriques : petit risque, gros potentiel.",
        ],
      },
    ],
    quiz: [
      {
        question: "Entrée 40 $, stop 38 $, objectif 46 $. Quel est le R:R ?",
        options: ["2:1", "3:1", "6:1"],
        correctIndex: 1,
        explanation: "Risque = 2 $, gain potentiel = 6 $. R:R = 6 ÷ 2 = 3:1.",
      },
      {
        question: "Avec un R:R de 2:1, quel taux de réussite minimum pour être rentable ?",
        options: ["Environ 33 %", "Environ 75 %", "100 %"],
        correctIndex: 0,
        explanation: "À 2:1, un trade gagnant paie 2 perdants : dès ~34 % de réussite on est gagnant. Pas besoin d'avoir raison souvent.",
      },
      {
        question: "Un trade vous tente mais son R:R est de 1:1. Que faire ?",
        options: ["Le prendre quand même si le signal est beau", "Le laisser passer : sous 2:1 on ne trade pas", "Doubler la taille pour compenser"],
        correctIndex: 1,
        explanation: "Le R:R est un filtre : sous 2:1, l'asymétrie n'est pas en votre faveur. Laisser passer est une décision de pro.",
      },
    ],
    practice: {
      label: "Calculer un R:R réel",
      description: "Dans le calculateur, entrez un prix d'entrée, un stop et un objectif pour voir le ratio d'un titre que vous suivez.",
      action: "calculator",
    },
  },
  {
    slug: "psychologie",
    title: "La psychologie du trader",
    emoji: "🧠",
    minutes: 5,
    summary: "FOMO, revenge trading, excès de confiance : reconnaître les pièges avant qu'ils coûtent cher.",
    sections: [
      {
        heading: "Votre pire ennemi est dans le miroir",
        paragraphs: [
          "Les stratégies échouent rarement à cause des maths — elles échouent parce qu'on ne les suit pas. Quatre pièges reviennent tout le temps :",
        ],
        bullets: [
          "FOMO : acheter parce que « ça monte et tout le monde en parle » — souvent au sommet",
          "Revenge trading : après une perte, reprendre un trade impulsif pour « se refaire »",
          "Biais de confirmation : ne lire que ce qui confirme votre position, ignorer les signaux contraires",
          "Excès de confiance : après 3 gains, doubler les tailles et abandonner les règles",
        ],
      },
      {
        heading: "L'antidote : la routine de débriefing",
        paragraphs: [
          "On ne supprime pas ses émotions, on les encadre. La meilleure protection est une routine écrite : chaque jour, relire ses trades et se demander « ai-je suivi mon plan ? » — pas « ai-je gagné ? ». Un trade perdant qui a respecté le plan est un BON trade. Un trade gagnant qui a violé le plan est un accident dangereux.",
          "Le débriefing quotidien de cette app est fait pour ça : notez votre état d'esprit, ce qui a marché, ce qui doit changer. La régularité de cette routine est ce qui sépare les traders qui durent des autres.",
        ],
      },
    ],
    quiz: [
      {
        question: "Après une grosse perte, vous voulez immédiatement reprendre un trade pour « vous refaire ». C'est…",
        options: ["De la détermination, c'est bien", "Du revenge trading — l'erreur la plus coûteuse", "Une stratégie de récupération valide"],
        correctIndex: 1,
        explanation: "Le revenge trading est impulsif, sans plan, avec des tailles trop grosses. Après une perte : pause, débriefing, puis retour au plan.",
      },
      {
        question: "Un trade perdant qui a parfaitement respecté votre plan est…",
        options: ["Un mauvais trade, puisqu'il a perdu", "Un bon trade : le résultat d'un trade ne juge pas sa qualité", "Une raison de changer de stratégie immédiatement"],
        correctIndex: 1,
        explanation: "On juge un trade sur le processus, pas sur le résultat. Les pertes planifiées font partie de toute stratégie rentable.",
      },
      {
        question: "Qu'est-ce que le FOMO pousse à faire ?",
        options: ["Vendre trop tôt une position gagnante", "Acheter au sommet parce que tout le monde achète", "Ignorer les frais de transaction"],
        correctIndex: 1,
        explanation: "La peur de rater l'opportunité fait acheter tard, souvent juste avant le retournement. S'il y a eu une occasion, il y en aura d'autres.",
      },
      {
        question: "Le meilleur antidote aux pièges psychologiques est…",
        options: ["Plus de volonté", "Une routine écrite de débriefing quotidien", "Trader seulement quand on se sent bien"],
        correctIndex: 1,
        explanation: "La volonté s'épuise ; la routine reste. Relire ses trades chaque jour et vérifier le respect du plan encadre les émotions.",
      },
    ],
    practice: {
      label: "Faire mon débriefing du jour",
      description: "Ouvrez le débriefing quotidien et notez votre état d'esprit et vos décisions du jour.",
      href: "/debrief",
    },
  },
  {
    slug: "journal-de-trading",
    title: "Le journal de trading",
    emoji: "📓",
    minutes: 3,
    summary: "Relire ses ordres passés pour trouver ses erreurs récurrentes — la donnée ne ment pas.",
    sections: [
      {
        heading: "La mémoire triche, le journal non",
        paragraphs: [
          "Sans journal, on se souvient de ses beaux coups et on oublie ses erreurs. Le journal des ordres enregistre la réalité : chaque entrée, chaque sortie, chaque prix.",
          "Relisez-le chaque semaine en cherchant des motifs :",
        ],
        bullets: [
          "Mes pertes viennent-elles toujours du même type de trade ?",
          "Est-ce que je vends mes gagnants trop tôt et garde mes perdants trop longtemps ?",
          "Mes trades impulsifs (hors plan) sont-ils rentables ? (indice : presque jamais)",
        ],
      },
      {
        heading: "Attention au statut des ordres",
        paragraphs: [
          "Un ordre « soumis » n'est pas un ordre exécuté. Pour analyser vos vrais résultats, ne comptez que les ordres réellement exécutés avec leur prix d'exécution. Cette app fait la distinction dans le journal des ordres — vérifiez toujours le statut avant de tirer des conclusions.",
        ],
      },
    ],
    quiz: [
      {
        question: "Pourquoi tenir un journal de trading ?",
        options: ["Pour l'impôt uniquement", "Parce que la mémoire embellit — le journal montre les vrais motifs d'erreurs", "Pour impressionner d'autres traders"],
        correctIndex: 1,
        explanation: "Le journal révèle les erreurs récurrentes que la mémoire efface : c'est l'outil d'amélioration n°1.",
      },
      {
        question: "Un ordre « soumis » dans le journal signifie…",
        options: ["Qu'il a été exécuté au prix affiché", "Qu'il a été envoyé mais pas forcément exécuté", "Qu'il a été annulé"],
        correctIndex: 1,
        explanation: "Soumis ≠ exécuté. Seuls les ordres exécutés, avec prix d'exécution, comptent dans l'analyse de vos résultats.",
      },
      {
        question: "Quel motif du journal doit vous alarmer le plus ?",
        options: ["Des petites pertes régulières avec stops respectés", "Des trades impulsifs hors plan qui se répètent", "Des gains plus petits que prévus"],
        correctIndex: 1,
        explanation: "Les petites pertes contrôlées sont normales. Les trades hors plan répétés signalent un problème de discipline qui finira par coûter cher.",
      },
    ],
    practice: {
      label: "Relire mon journal des ordres",
      description: "Parcourez vos derniers ordres et repérez un motif : vente trop tôt ? Trade hors plan ? Statut vraiment exécuté ?",
      href: "/ordres",
    },
  },
  {
    slug: "coupe-circuit",
    title: "Le coupe-circuit",
    emoji: "🔌",
    minutes: 4,
    summary: "Des limites automatiques qui arrêtent tout quand la journée tourne mal — décidées à froid.",
    sections: [
      {
        heading: "S'arrêter avant la spirale",
        paragraphs: [
          "Les pires journées de trading suivent toujours le même scénario : une perte, puis une deuxième pour se refaire, puis une troisième plus grosse… Le coupe-circuit casse cette spirale : c'est une limite décidée À FROID qui, une fois atteinte, arrête le trading de la journée — sans négociation.",
          "Exemples de coupe-circuits :",
        ],
        bullets: [
          "Perte journalière max : −3 % du capital → on ferme tout et on arrête",
          "3 trades perdants consécutifs → pause obligatoire jusqu'au lendemain",
          "Nombre max de trades par jour (ex. 5) → évite le sur-trading",
        ],
      },
      {
        heading: "L'automatiser plutôt que le promettre",
        paragraphs: [
          "Une règle qu'on se « promet » de suivre ne survit pas à une mauvaise journée. Une règle automatisée, si. C'est exactement le rôle de l'Auto-Trader de cette app : ses règles surveillent le marché en continu et exécutent la consigne décidée à froid — même quand vous n'êtes pas devant l'écran, même quand l'émotion voudrait faire autrement.",
        ],
      },
    ],
    quiz: [
      {
        question: "Qu'est-ce qu'un coupe-circuit en trading ?",
        options: ["Un type d'ordre d'achat rapide", "Une limite décidée à froid qui stoppe le trading quand elle est atteinte", "Une pause serveur de la bourse"],
        correctIndex: 1,
        explanation: "Le coupe-circuit (perte max journalière, nb de pertes consécutives…) casse la spirale des mauvaises journées.",
      },
      {
        question: "Vous avez perdu 3 trades de suite ce matin. Votre coupe-circuit dit stop. Mais vous « sentez » le prochain trade…",
        options: ["On le prend, l'intuition compte", "On s'arrête : la règle décidée à froid prime sur le ressenti à chaud", "On le prend avec une taille double"],
        correctIndex: 1,
        explanation: "Le coupe-circuit existe précisément pour ce moment-là. Le « ressenti » après 3 pertes est l'émotion, pas l'analyse.",
      },
      {
        question: "Pourquoi automatiser ses règles plutôt que se les promettre ?",
        options: ["Parce que c'est plus rapide à configurer", "Parce qu'une promesse ne survit pas à une mauvaise journée, une règle automatique oui", "Parce que c'est obligatoire légalement"],
        correctIndex: 1,
        explanation: "L'automatisation exécute la décision prise à froid, même quand l'émotion pousse à faire autrement.",
      },
    ],
    practice: {
      label: "Configurer une règle Auto-Trader",
      description: "Créez une règle automatique (ex. vente si baisse de X %) qui appliquera votre consigne sans émotion.",
      href: "/auto-trader",
    },
  },
];

export const lessonBySlug = (slug: string) => LESSONS.find((l) => l.slug === slug);
