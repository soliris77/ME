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
  level?: "fondations" | "avance"; // niveau du parcours (défaut : fondations)
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

  // ── Niveau avancé ──────────────────────────────────────────────────────────
  {
    slug: "esperance-mathematique",
    title: "L'espérance mathématique",
    emoji: "🎲",
    minutes: 5,
    level: "avance",
    summary: "Gain moyen × taux de réussite face à la perte moyenne : pourquoi un système à 40 % de réussite peut être gagnant.",
    sections: [
      {
        heading: "Le seul chiffre qui compte vraiment",
        paragraphs: [
          "Avoir raison souvent ne suffit pas à être rentable. Ce qui compte, c'est l'espérance mathématique : le gain moyen que rapporte chaque trade sur le long terme, en tenant compte à la fois de vos gains, de vos pertes et de leur fréquence.",
          "La formule est simple : espérance = (taux de réussite × gain moyen) − (taux d'échec × perte moyenne). Si le résultat est positif, le système est gagnant à long terme, même si vous perdez plus souvent que vous ne gagnez.",
        ],
      },
      {
        heading: "Un exemple qui va à contre-intuition",
        paragraphs: [
          "Prenons un système qui ne réussit que 40 % du temps. La plupart des débutants l'abandonneraient. Pourtant, s'il gagne gros et perd petit, il est très rentable :",
        ],
        example: [
          "Taux de réussite : 40 % / Taux d'échec : 60 %",
          "Gain moyen d'un trade gagnant : 300 $",
          "Perte moyenne d'un trade perdant : 100 $",
          "Espérance = (0,40 × 300) − (0,60 × 100)",
          "Espérance = 120 − 60 = +60 $ par trade ✅",
        ],
        bullets: [
          "Sur 100 trades : ~40 gagnants × 300 $ = 12 000 $ de gains",
          "~60 perdants × 100 $ = 6 000 $ de pertes → +6 000 $ net",
          "Le secret : couper les pertes court et laisser courir les gains",
        ],
      },
      {
        heading: "Mesurer son espérance réelle",
        paragraphs: [
          "L'espérance théorique ne vaut que si vos chiffres sont réels. Vos statistiques passées (taux de réussite, gain et perte moyens) sont la seule base fiable. La page Performance calcule tout cela à partir de vos ordres réellement exécutés.",
          "Un système à espérance négative ne se corrige pas en tradant plus : il faut soit améliorer le taux de réussite, soit augmenter le gain moyen, soit réduire la perte moyenne. Souvent, réduire la perte moyenne (stops plus serrés, discipline) est le levier le plus rapide.",
        ],
      },
    ],
    quiz: [
      {
        question: "Un système réussit 40 % du temps, gagne 300 $ en moyenne et perd 100 $ en moyenne. Quelle est son espérance par trade ?",
        options: ["−60 $", "+60 $", "+200 $"],
        correctIndex: 1,
        explanation: "(0,40 × 300) − (0,60 × 100) = 120 − 60 = +60 $. Un taux de réussite faible reste gagnant si les gains dépassent largement les pertes.",
      },
      {
        question: "Quelle affirmation sur l'espérance mathématique est correcte ?",
        options: [
          "Il faut gagner plus souvent qu'on ne perd pour être rentable",
          "Un système peut être rentable avec 40 % de réussite si le gain moyen dépasse la perte moyenne",
          "L'espérance ne dépend que du taux de réussite",
        ],
        correctIndex: 1,
        explanation: "L'espérance combine fréquence ET amplitude. Un faible taux de réussite se compense par des gains moyens plus gros que les pertes moyennes.",
      },
      {
        question: "Votre système a une espérance négative. Quel est le levier souvent le plus rapide pour la corriger ?",
        options: ["Trader beaucoup plus pour se refaire", "Réduire la perte moyenne (stops plus serrés, discipline)", "Augmenter la taille de chaque position"],
        correctIndex: 1,
        explanation: "Réduire la perte moyenne agit directement sur l'espérance sans dépendre de la chance. Trader plus ou plus gros amplifie une espérance négative.",
      },
      {
        question: "Sur quoi doit reposer le calcul de votre espérance réelle ?",
        options: ["Vos meilleurs souvenirs de trades", "Vos ordres réellement exécutés (page Performance)", "Une estimation optimiste de vos futurs gains"],
        correctIndex: 1,
        explanation: "Seuls les ordres exécutés donnent des chiffres fiables. La page Performance calcule taux de réussite, gain et perte moyens à partir de ces données.",
      },
    ],
    practice: {
      label: "Analyser mes statistiques réelles",
      description: "Ouvrez la page Performance et calculez votre taux de réussite, votre gain moyen et votre perte moyenne pour estimer votre espérance.",
      href: "/performance",
    },
  },
  {
    slug: "sorties-partielles",
    title: "Sorties partielles et stop suiveur",
    emoji: "🪜",
    minutes: 5,
    level: "avance",
    summary: "Sécuriser une partie du gain, laisser courir le reste, et remonter le stop sans jamais le baisser.",
    sections: [
      {
        heading: "Ne pas tout vendre d'un coup",
        paragraphs: [
          "Le dilemme classique : vendre trop tôt et regarder le titre continuer sa hausse, ou garder et voir le gain s'évaporer. La sortie partielle résout ce conflit en vendant une fraction de la position à un premier objectif, puis en laissant courir le reste.",
          "Une approche courante consiste à vendre la moitié au premier objectif, ce qui sécurise un gain concret, puis à gérer la seconde moitié avec un stop qu'on remonte au fil de la hausse.",
        ],
      },
      {
        heading: "Le stop suiveur : remonter, jamais baisser",
        paragraphs: [
          "Le stop suiveur (trailing stop) accompagne le prix vers le haut. Règle absolue : on ne remonte le stop que lorsque le prix progresse, on ne le baisse jamais. Baisser un stop annule sa protection au pire moment.",
        ],
        example: [
          "Entrée : 100 $ / Stop initial : 95 $ (risque 5 $)",
          "Le prix atteint 110 $ → on vend la moitié (gain sécurisé : +10 $/action)",
          "On remonte le stop de 95 $ à 100 $ (point mort) sur le reste",
          "Le prix monte à 120 $ → stop remonté à 110 $",
          "Le reste ne peut plus devenir perdant : trade « sans risque »",
        ],
        bullets: [
          "1re moitié vendue → gain concret encaissé",
          "Stop remonté au prix d'entrée → position devenue sans risque",
          "Le reste capte la grande tendance si elle continue",
        ],
      },
    ],
    quiz: [
      {
        question: "Quel est l'intérêt principal d'une sortie partielle ?",
        options: ["Payer moins de frais", "Sécuriser un gain concret tout en laissant courir le reste de la position", "Doubler la taille de la position"],
        correctIndex: 1,
        explanation: "Vendre une fraction encaisse un gain réel et calme l'émotion, tandis que le solde peut profiter de la suite de la tendance.",
      },
      {
        question: "Après une sortie partielle, vous remontez le stop du reste au prix d'entrée. Conséquence ?",
        options: ["La position ne peut plus devenir perdante", "Le risque double", "Vous perdez le gain déjà encaissé"],
        correctIndex: 0,
        explanation: "Stop au point mort = si le prix redescend, on sort à zéro sur ce reste. Combiné au gain déjà pris, le trade est globalement gagnant ou neutre.",
      },
      {
        question: "Le prix redescend et vous êtes tenté de baisser le stop suiveur. Verdict ?",
        options: ["Acceptable pour laisser respirer le titre", "Jamais : un stop suiveur ne se remonte que dans le sens du gain", "Obligatoire pour rester dans le trade"],
        correctIndex: 1,
        explanation: "Le stop suiveur ne descend jamais. Le baisser revient à supprimer la protection au moment où elle sert le plus.",
      },
      {
        question: "Dans quel sens remonte-t-on un stop suiveur ?",
        options: ["Uniquement quand le prix progresse en notre faveur", "Chaque jour d'un montant fixe", "Quand on a peur de perdre le gain"],
        correctIndex: 0,
        explanation: "Le stop ne bouge que lorsque le prix monte (position longue), verrouillant progressivement le gain acquis.",
      },
    ],
    practice: {
      label: "Poser une alerte de sortie partielle",
      description: "Sur la page Alertes, posez une alerte au niveau de votre premier objectif pour être prévenu quand vendre une partie de la position.",
      href: "/alerts",
    },
  },
  {
    slug: "correlation-exposition",
    title: "Corrélation et exposition réelle",
    emoji: "🔗",
    minutes: 5,
    level: "avance",
    summary: "Trois positions tech qui bougent ensemble, c'est une seule grosse position déguisée.",
    sections: [
      {
        heading: "La fausse diversification",
        paragraphs: [
          "Détenir plusieurs titres n'est pas forcément être diversifié. Si vos positions montent et descendent ensemble, vous êtes fortement corrélé : vous portez en réalité une seule grosse position, découpée en plusieurs lignes.",
          "La corrélation mesure à quel point deux actifs bougent dans le même sens. Proche de +1, ils évoluent quasi à l'identique ; proche de 0, ils sont indépendants ; proche de −1, ils vont en sens opposé.",
        ],
      },
      {
        heading: "Un exemple d'exposition cachée",
        paragraphs: [
          "Imaginez un portefeuille qui se croit prudent parce qu'il détient trois titres différents :",
        ],
        example: [
          "Position A : 2 000 $ (grande valeur technologique)",
          "Position B : 2 000 $ (autre valeur technologique)",
          "Position C : 2 000 $ (semi-conducteurs)",
          "Corrélation entre les trois : ~0,9 (très élevée)",
          "Exposition réelle au secteur tech : 6 000 $ d'un seul bloc",
        ],
        bullets: [
          "Une mauvaise nouvelle sur la tech fait plonger les trois en même temps",
          "Le risque n'est pas réparti, il est concentré",
          "Vraie diversification : des actifs à corrélation faible ou négative",
        ],
      },
      {
        heading: "Mesurer avant d'ajouter",
        paragraphs: [
          "Avant d'ajouter une position, la bonne question n'est pas « ce titre est-il intéressant ? » mais « augmente-t-il une exposition que j'ai déjà ? ». Un nouveau titre fortement corrélé à vos positions existantes ne diversifie rien : il concentre.",
          "La page Corrélation de cette app calcule la corrélation entre vos positions, ce qui rend visible l'exposition réelle avant d'agir.",
        ],
      },
    ],
    quiz: [
      {
        question: "Vous détenez trois valeurs technologiques corrélées à ~0,9. Quelle est votre situation ?",
        options: ["Un portefeuille bien diversifié", "Une seule grosse position tech déguisée en trois lignes", "Un portefeuille sans risque"],
        correctIndex: 1,
        explanation: "Une corrélation proche de +1 signifie que les titres bougent ensemble : l'exposition est concentrée, pas diversifiée.",
      },
      {
        question: "Que mesure la corrélation entre deux actifs ?",
        options: ["Leur prix moyen", "À quel point ils bougent dans le même sens", "Leur volume d'échange"],
        correctIndex: 1,
        explanation: "La corrélation (de −1 à +1) indique le degré de synchronisation des mouvements de deux actifs.",
      },
      {
        question: "Pour vraiment diversifier, quels actifs faut-il combiner ?",
        options: ["Des actifs à corrélation élevée (proche de +1)", "Des actifs à corrélation faible ou négative", "Uniquement des actifs du même secteur"],
        correctIndex: 1,
        explanation: "Des corrélations faibles ou négatives font que les actifs ne chutent pas tous en même temps : c'est ça, la vraie diversification.",
      },
      {
        question: "Avant d'ajouter une nouvelle position, quelle est la bonne question ?",
        options: ["Ce titre a-t-il beaucoup monté récemment ?", "Augmente-t-il une exposition que j'ai déjà ?", "Est-ce le titre le moins cher ?"],
        correctIndex: 1,
        explanation: "Un titre fortement corrélé à vos positions existantes concentre le risque au lieu de le répartir.",
      },
    ],
    practice: {
      label: "Mesurer la corrélation de mes positions",
      description: "Ouvrez la page Corrélation pour voir à quel point vos positions bougent ensemble et repérer une exposition cachée.",
      href: "/correlation",
    },
  },
  {
    slug: "pyramider",
    title: "Pyramider sans exploser le risque",
    emoji: "🔺",
    minutes: 5,
    level: "avance",
    summary: "Renforcer une position uniquement quand elle gagne, avec le stop remonté — jamais moyenner à la baisse.",
    sections: [
      {
        heading: "Ajouter sur les gagnants, pas sur les perdants",
        paragraphs: [
          "Pyramider, c'est augmenter la taille d'une position qui va déjà dans votre sens. C'est l'exact opposé de « moyenner à la baisse », qui consiste à racheter un titre qui chute pour abaisser son prix moyen — une pratique qui transforme les petites pertes en catastrophes.",
          "La logique est saine : on met plus d'argent là où le marché confirme qu'on a raison, et jamais là où il prouve qu'on a tort.",
        ],
        bullets: [
          "Pyramider = ajouter sur une position gagnante qui confirme la tendance",
          "Moyenner à la baisse = racheter un titre qui chute (à proscrire)",
          "On renforce la conviction du marché, pas la sienne",
        ],
      },
      {
        heading: "Remonter le stop au prix d'entrée moyen",
        paragraphs: [
          "La clé pour pyramider sans exploser le risque : à chaque ajout, on remonte le stop de l'ensemble au niveau du nouveau prix d'entrée moyen (ou plus haut). Ainsi, le risque total reste maîtrisé même si la position grossit.",
        ],
        example: [
          "Achat 1 : 100 actions à 50 $ / Stop : 48 $",
          "Le prix monte à 55 $ → Achat 2 : 100 actions à 55 $",
          "Prix d'entrée moyen : 52,50 $",
          "On remonte le stop à ~52,50 $ (point mort de l'ensemble)",
          "Position doublée, mais risque global proche de zéro",
        ],
      },
      {
        heading: "Le piège à éviter absolument",
        paragraphs: [
          "Moyenner à la baisse ressemble à pyramider mais s'y oppose totalement : on ajoute sur une position perdante en espérant un retournement. Résultat : la taille augmente pendant que la thèse se dégrade, et une perte contrôlée devient une perte majeure.",
          "Règle claire : on n'ajoute que sur une position en gain, avec un stop remonté. Si la position perd, on ne renforce pas — on applique le plan de sortie.",
        ],
      },
    ],
    quiz: [
      {
        question: "Quand est-il justifié de pyramider (ajouter à une position) ?",
        options: ["Quand la position est perdante, pour abaisser le prix moyen", "Quand la position est déjà gagnante et confirme la tendance", "À intervalles réguliers, peu importe le prix"],
        correctIndex: 1,
        explanation: "On ajoute là où le marché confirme qu'on a raison. Ajouter sur une position perdante (moyenner à la baisse) est à proscrire.",
      },
      {
        question: "Après un ajout, que faut-il faire du stop pour maîtriser le risque ?",
        options: ["Le laisser à son niveau initial", "Le remonter au prix d'entrée moyen (ou plus haut)", "Le supprimer puisque la position gagne"],
        correctIndex: 1,
        explanation: "Remonter le stop au prix moyen garde le risque total sous contrôle même quand la position grossit.",
      },
      {
        question: "Achat 1 : 100 actions à 50 $. Achat 2 : 100 actions à 55 $. Quel est le prix d'entrée moyen ?",
        options: ["50 $", "52,50 $", "55 $"],
        correctIndex: 1,
        explanation: "(50 + 55) ÷ 2 = 52,50 $. Le stop se remonte alors autour de ce niveau pour neutraliser le risque de l'ensemble.",
      },
      {
        question: "Votre position est en perte. Faut-il pyramider ?",
        options: ["Oui, pour abaisser le prix moyen", "Non, on n'ajoute que sur une position gagnante", "Oui, si on est convaincu du retournement"],
        correctIndex: 1,
        explanation: "Ajouter sur une position perdante, c'est moyenner à la baisse : la taille grossit pendant que la thèse se dégrade. On applique le plan de sortie, pas un renforcement.",
      },
    ],
    practice: {
      label: "Recalculer ma taille après un ajout",
      description: "Ouvrez le calculateur pour dimensionner un ajout et vérifier le nouveau risque total avec le stop remonté au prix moyen.",
      action: "calculator",
    },
  },
  {
    slug: "biais-cognitifs",
    title: "Les biais cognitifs avancés",
    emoji: "🪞",
    minutes: 6,
    level: "avance",
    summary: "Revenge trading, biais de récence, coût irrécupérable, excès de confiance : les reconnaître et les neutraliser.",
    sections: [
      {
        heading: "Quatre biais qui coûtent cher",
        paragraphs: [
          "Au-delà du FOMO, quatre biais plus insidieux minent la discipline des traders qui progressent. Les nommer est la première étape pour les désamorcer :",
        ],
        bullets: [
          "Revenge trading : après une perte, reprendre un trade impulsif pour « se refaire », souvent avec une taille trop grosse",
          "Biais de récence : surpondérer les derniers événements (« ça monte depuis 3 jours, donc ça va continuer »)",
          "Coût irrécupérable : garder une position perdante parce qu'on y a déjà « mis trop d'argent » — l'argent perdu ne revient pas en gardant",
          "Excès de confiance : après une série de gains, augmenter les tailles et abandonner les règles",
        ],
      },
      {
        heading: "Le coût irrécupérable en détail",
        paragraphs: [
          "Le biais de coût irrécupérable (sunk cost) fait confondre l'argent déjà perdu avec l'avenir de la position. Un exemple :",
        ],
        example: [
          "Achat : 3 000 $ dans un titre qui vaut maintenant 1 800 $",
          "Perte latente : −1 200 $ (déjà « dépensée »)",
          "Mauvais raisonnement : « je garde, j'ai trop investi pour vendre »",
          "Bonne question : « si j'avais 1 800 $ en liquide, achèterais-je ce titre aujourd'hui ? »",
          "Si non → la perte passée n'est pas une raison de rester",
        ],
      },
      {
        heading: "Des parades concrètes",
        paragraphs: [
          "On ne combat pas un biais par la volonté seule, mais par des dispositifs :",
        ],
        bullets: [
          "Coupe-circuit : une limite automatique (perte max, nb de pertes) qui stoppe le revenge trading",
          "Journal : relire ses trades rend le biais de récence visible et met les résultats en perspective sur la durée",
          "Débriefing : se demander chaque jour « ai-je suivi mon plan ? » désamorce l'excès de confiance et le coût irrécupérable",
          "Règle du « j'achèterais aujourd'hui ? » pour trancher les positions marquées par le coût irrécupérable",
        ],
      },
    ],
    quiz: [
      {
        question: "Vous gardez une position perdante « parce que vous y avez déjà mis trop d'argent ». Quel biais est-ce ?",
        options: ["Biais de récence", "Coût irrécupérable (sunk cost)", "FOMO"],
        correctIndex: 1,
        explanation: "L'argent déjà perdu ne se récupère pas en gardant. La bonne question : achèterais-je ce titre aujourd'hui avec l'argent restant ?",
      },
      {
        question: "« Ça monte depuis 3 jours, donc ça va continuer. » Quel biais parle ?",
        options: ["Biais de récence", "Coût irrécupérable", "Revenge trading"],
        correctIndex: 0,
        explanation: "Le biais de récence surpondère les événements les plus récents et fait extrapoler une tendance courte sans fondement.",
      },
      {
        question: "Quelle parade concrète est la plus efficace contre le revenge trading ?",
        options: ["Plus de volonté", "Un coupe-circuit automatique (perte max, nb de pertes)", "Augmenter la taille pour se refaire vite"],
        correctIndex: 1,
        explanation: "Une limite automatique décidée à froid stoppe la spirale impulsive mieux que n'importe quelle promesse.",
      },
      {
        question: "Après une belle série de gains, vous doublez vos tailles et laissez tomber vos règles. Quel biais ?",
        options: ["Coût irrécupérable", "Excès de confiance", "Biais de récence uniquement"],
        correctIndex: 1,
        explanation: "L'excès de confiance après des succès pousse à prendre plus de risques. Le débriefing quotidien aide à rester discipliné même quand tout va bien.",
      },
    ],
    practice: {
      label: "Faire mon débriefing du jour",
      description: "Ouvrez le débriefing quotidien et repérez si un de ces biais a influencé vos décisions récentes.",
      href: "/debrief",
    },
  },
  {
    slug: "drawdown",
    title: "Lire un drawdown",
    emoji: "📉",
    minutes: 5,
    level: "avance",
    summary: "Une perte de 20 % exige un gain de 25 % pour revenir à l'équilibre — d'où l'importance de réduire la taille en drawdown.",
    sections: [
      {
        heading: "L'asymétrie perte / récupération",
        paragraphs: [
          "Le drawdown est la baisse de votre capital depuis son plus haut. Sa mécanique est piégeuse : perdre un pourcentage donné exige un gain SUPÉRIEUR pour revenir au point de départ, car ce gain s'applique sur un capital réduit.",
        ],
        example: [
          "−10 % exige +11,1 % pour récupérer",
          "−20 % exige +25 % pour récupérer",
          "−50 % exige +100 % pour récupérer",
          "−80 % exige +400 % pour récupérer",
        ],
        bullets: [
          "Plus le drawdown est profond, plus la remontée requise explose",
          "Éviter les grosses pertes vaut mieux que d'espérer de gros rebonds",
          "C'est pour ça qu'on protège le capital avant de chercher le gain",
        ],
      },
      {
        heading: "Réduire la taille pendant un drawdown",
        paragraphs: [
          "Instinctivement, on veut « se refaire » en tradant plus gros après une série de pertes. C'est exactement l'inverse qu'il faut faire. Réduire la taille des positions pendant un drawdown limite l'aggravation et laisse le temps de retrouver ses marques.",
          "Une approche disciplinée consiste à baisser la taille de position quand le drawdown dépasse un seuil, puis à revenir progressivement à la normale une fois la courbe stabilisée.",
        ],
      },
      {
        heading: "Avoir un plan de récupération",
        paragraphs: [
          "Un plan de récupération se décide à froid, avant d'en avoir besoin : à quel niveau de drawdown je réduis la taille, quand je m'arrête complètement pour réévaluer, et comment je reviens progressivement.",
          "La vue de risque global de l'Auto-Trader permet de suivre votre exposition et votre drawdown pour appliquer ce plan sans céder à l'émotion.",
        ],
      },
    ],
    quiz: [
      {
        question: "Votre capital subit un drawdown de 20 %. Quel gain faut-il pour revenir à l'équilibre ?",
        options: ["+20 %", "+25 %", "+15 %"],
        correctIndex: 1,
        explanation: "Le gain s'applique sur un capital réduit : 100 → 80, il faut +25 % (80 × 1,25 = 100) pour récupérer.",
      },
      {
        question: "Pourquoi la remontée requise dépasse-t-elle toujours la perte subie ?",
        options: ["À cause des frais uniquement", "Parce que le gain se calcule sur un capital réduit par la perte", "C'est une coïncidence sans règle"],
        correctIndex: 1,
        explanation: "Après une perte, le capital de base est plus petit, donc il faut un pourcentage de gain plus élevé pour revenir au niveau initial.",
      },
      {
        question: "Que faire de la taille de position pendant un drawdown important ?",
        options: ["L'augmenter pour se refaire vite", "La réduire pour limiter l'aggravation", "Ne rien changer"],
        correctIndex: 1,
        explanation: "Réduire la taille pendant un drawdown limite les dégâts. Augmenter la taille amplifie une mauvaise passe.",
      },
      {
        question: "Quand décide-t-on son plan de récupération ?",
        options: ["Pendant le drawdown, sous le stress", "À froid, avant d'en avoir besoin", "Jamais, on improvise"],
        correctIndex: 1,
        explanation: "Un plan décidé à froid (seuils de réduction, pause, retour progressif) résiste à l'émotion mieux qu'une décision prise en pleine perte.",
      },
    ],
    practice: {
      label: "Voir mon risque global",
      description: "Ouvrez la vue de risque global de l'Auto-Trader pour suivre votre exposition et votre drawdown, et appliquer votre plan de récupération.",
      href: "/auto-trader",
    },
  },
];

export const lessonBySlug = (slug: string) => LESSONS.find((l) => l.slug === slug);
