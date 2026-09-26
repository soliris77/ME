import { Router, type IRouter, type Request, type Response } from "express";

/**
 * JARVIS — le cerveau conversationnel de Soliris, et sa voix.
 *
 * ─── Principe de conception, non négociable ────────────────────────────────
 *
 *   Jarvis ne peut RIEN faire que toi, connecté, tu ne puisses déjà faire.
 *
 * Il n'accède pas à la base, pas au broker, pas à orderEngine. Il appelle
 * l'API de Soliris par HTTP en réutilisant TON cookie de session. Donc :
 *   - sans session authentifiée il obtient 401 comme n'importe qui ;
 *   - il hérite exactement de tes droits, jamais plus ;
 *   - aucune route existante n'est modifiée pour lui.
 *
 * Il est en LECTURE SEULE. LECTURE_AUTORISEE est une liste blanche : ce qui
 * n'y est pas est refusé, et seul GET passe. Quand Jarvis veut agir, il ne
 * fait que PROPOSER — un objet structuré que l'interface affiche et que tu
 * confirmes d'un geste. La confirmation part ensuite par POST /api/plans,
 * le chemin déjà en place et déjà testé.
 *
 * ─── Fournisseur de modèle ─────────────────────────────────────────────────
 *
 * Tout passe par le format OpenAI, que Gemini, Groq, Mistral, OpenAI et
 * GitHub Models parlent tous. Changer de fournisseur = changer deux
 * variables d'environnement, pas une ligne de code.
 *
 *   Gemini  (défaut)  JARVIS_BASE=https://generativelanguage.googleapis.com/v1beta/openai
 *                     JARVIS_MODELE=gemini-3.8-flash
 *                     GEMINI_API_KEY=...
 *
 *   Groq              JARVIS_BASE=https://api.groq.com/openai/v1
 *                     JARVIS_MODELE=<un modèle Groq>
 *                     JARVIS_API_KEY=...
 *
 *   OpenAI            JARVIS_BASE=https://api.openai.com/v1
 *                     JARVIS_MODELE=gpt-...
 *                     OPENAI_API_KEY=...
 *
 * Les clés ne quittent jamais le serveur. Le navigateur n'en voit aucune.
 */

const router: IRouter = Router();

// ─── Réglages ──────────────────────────────────────────────────────────────

const BASE =
  process.env.JARVIS_BASE ?? "https://generativelanguage.googleapis.com/v1beta/openai";
const MODELE = process.env.JARVIS_MODELE ?? "gemini-3.8-flash";

/** Première clé trouvée gagne : on peut changer de fournisseur sans toucher au code. */
const CLE =
  process.env.JARVIS_API_KEY ??
  process.env.GEMINI_API_KEY ??
  process.env.OPENAI_API_KEY ??
  process.env.GROQ_API_KEY ??
  "";

const CLE_VOIX = process.env.ELEVENLABS_API_KEY ?? "";
const MODELE_VOIX = process.env.ELEVENLABS_MODELE ?? "eleven_multilingual_v2";

const PORT_LOCAL = process.env.PORT ?? "5000";
const BASE_LOCALE = `http://127.0.0.1:${PORT_LOCAL}`;

const MAX_TOURS = 6; // garde-fou : au-delà, Jarvis tourne en rond
const MAX_HISTORIQUE = 12;
const MAX_CARACTERES_VOIX = 900; // ElevenLabs facture au caractère
const MAX_ESSAIS = 3; // sur 429 / 5xx, avec attente croissante

/** Liste blanche des lectures. Fail-closed : absent d'ici = refusé. */
const LECTURE_AUTORISEE: readonly string[] = [
  "/api/portfolio",
  "/api/broker/allocation",
  "/api/broker/accounts",
  "/api/broker/orders",
  "/api/quotes",
  "/api/market",
  "/api/news",
  "/api/watchlist",
  "/api/alerts",
  "/api/plans",
  "/api/performance",
  "/api/calendar",
  "/api/scanner",
  "/api/signals",
  "/api/debrief",
  "/api/notes",
  "/api/theses",
  "/api/symbols",
  "/api/settings",
  "/api/daily-summary",
];

// ─── Types (format OpenAI) ─────────────────────────────────────────────────

interface AppelOutil {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface MessageSortie {
  role: "assistant";
  content: string | null;
  tool_calls?: AppelOutil[];
}

type Message =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: AppelOutil[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface Tour {
  role: "user" | "assistant";
  contenu: string;
}

interface Proposition {
  genre: "plan";
  resume: string;
  corps: Record<string, unknown>;
}

// ─── Les outils ────────────────────────────────────────────────────────────

const OUTILS = [
  {
    type: "function" as const,
    function: {
      name: "lire",
      description:
        "Lit une ressource de l'API Soliris (GET uniquement). Sers-t'en pour connaître " +
        "le portefeuille, les positions, les prix, les plans, les signaux, les actualités, " +
        "la performance. Exemples : /api/portfolio, /api/broker/allocation, " +
        "/api/quotes?symbols=AAPL,BTC, /api/plans, /api/signals. Si un chemin est refusé, " +
        "n'insiste pas : dis-le simplement.",
      parameters: {
        type: "object",
        properties: {
          chemin: {
            type: "string",
            description: "Chemin commençant par /api/, avec sa chaîne de requête si besoin.",
          },
        },
        required: ["chemin"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "proposer_plan",
      description:
        "Prépare un ordre à cours limité ou un achat récurrent et le SOUMET À L'APPROBATION " +
        "de Lion. Ceci n'envoie aucun ordre : cela affiche une carte qu'il doit confirmer d'un " +
        "geste. Utilise-le dès qu'il demande d'acheter, de vendre, de programmer un achat ou " +
        "de poser une limite. Ne demande jamais confirmation par la voix : la carte s'en charge.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["limite", "recurrent"],
            description: "limite = déclenché par un prix. recurrent = déclenché par un calendrier.",
          },
          symbole: { type: "string", description: "Ex. AAPL, BTC-USD." },
          sens: { type: "string", enum: ["achat", "vente"] },
          montant: {
            type: "number",
            description: "Montant en dollars à engager (pas un nombre de parts).",
          },
          prix_declencheur: {
            type: "number",
            description: "Pour un plan à cours limité : le prix qui déclenche. Sinon, omets.",
          },
          cadence: {
            type: "string",
            enum: ["quotidien", "hebdomadaire", "mensuel"],
            description: "Pour un plan récurrent. Sinon, omets.",
          },
          pourquoi: {
            type: "string",
            description: "Une phrase : la raison, telle que tu l'expliquerais à Lion.",
          },
        },
        required: ["type", "symbole", "sens", "montant", "pourquoi"],
      },
    },
  },
];

const CONSIGNE = `Tu es Jarvis, l'assistant de Soliris Market. Tu parles à Lion.

Ton registre : direct, court, sans flatterie. Tu es lu à voix haute, donc pas de
listes à puces, pas de tableaux, pas de Markdown — des phrases. Les nombres
s'écrivent comme on les dit : « douze mille quatre cents dollars », pas
« 12 400,00 $ ». Tu réponds en français.

Tu as accès à ses données en lecture. Avant d'affirmer un chiffre, va le lire —
ne devine jamais un solde, un prix ou une position. Si une lecture échoue, dis
franchement que tu n'as pas pu, et laquelle.

Quand il veut agir, appelle proposer_plan. Tu ne passes pas d'ordres : tu prépares,
il confirme d'un geste. Ne lui demande pas « es-tu sûr ? » — la carte de
confirmation est là pour ça.

Tu n'es pas son conseiller financier et tu ne fais pas semblant de l'être. Tu lui
donnes les faits dont il a besoin pour décider. S'il te demande si un achat est une
bonne idée, tu peux donner ce qui plaide pour et ce qui plaide contre, en nommant ce
que tu ignores — la décision reste la sienne.

Si quelque chose dans les données te paraît anormal — une position qui a fondu, un
plan déclenché sans qu'il le sache — dis-le, même s'il n'a pas posé la question.

Réponses courtes. Deux ou trois phrases sauf s'il en demande plus.`;

// ─── Lecture interne, avec la session de l'appelant ────────────────────────

function cheminAutorise(chemin: string): boolean {
  if (!chemin.startsWith("/api/")) return false;
  if (chemin.includes("..")) return false;
  const sansRequete = chemin.split("?")[0] ?? "";
  return LECTURE_AUTORISEE.some(
    (prefixe) => sansRequete === prefixe || sansRequete.startsWith(`${prefixe}/`),
  );
}

async function lireRessource(chemin: string, cookie: string): Promise<string> {
  if (!cheminAutorise(chemin)) {
    return `Refusé : ${chemin} n'est pas dans la liste des lectures autorisées.`;
  }
  try {
    const reponse = await fetch(`${BASE_LOCALE}${chemin}`, {
      method: "GET",
      headers: cookie === "" ? {} : { cookie },
    });
    const texte = await reponse.text();
    if (!reponse.ok) {
      return `Erreur ${reponse.status} sur ${chemin} : ${texte.slice(0, 400)}`;
    }
    return texte.length > 24_000 ? `${texte.slice(0, 24_000)}\n…(tronqué)` : texte;
  } catch (erreur) {
    const motif = erreur instanceof Error ? erreur.message : String(erreur);
    return `Lecture impossible de ${chemin} : ${motif}`;
  }
}

// ─── Appel au modèle, avec réessai sur 429 ─────────────────────────────────

const dormir = (ms: number): Promise<void> =>
  new Promise((resoudre) => setTimeout(resoudre, ms));

async function appelerModele(messages: Message[]): Promise<MessageSortie> {
  let dernierMotif = "";

  for (let essai = 0; essai < MAX_ESSAIS; essai += 1) {
    const reponse = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${CLE}`,
      },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: 1200,
        messages,
        tools: OUTILS,
      }),
    });

    // 429 = quota par minute atteint. 5xx = hoquet côté fournisseur.
    // Dans les deux cas on attend et on recommence, au lieu de planter.
    if (reponse.status === 429 || reponse.status >= 500) {
      dernierMotif = `${reponse.status} ${(await reponse.text()).slice(0, 200)}`;
      if (essai < MAX_ESSAIS - 1) {
        await dormir(1500 * (essai + 1));
        continue;
      }
      throw new Error(
        reponse.status === 429
          ? "Quota du fournisseur atteint. Réessaie dans une minute."
          : `Fournisseur indisponible : ${dernierMotif}`,
      );
    }

    if (!reponse.ok) {
      const detail = await reponse.text();
      throw new Error(`Modèle indisponible (${reponse.status}) : ${detail.slice(0, 300)}`);
    }

    const brut = (await reponse.json()) as {
      choices?: { message?: MessageSortie }[];
    };
    const premier = Array.isArray(brut.choices) ? brut.choices[0] : undefined;
    const message = premier?.message;
    if (message === undefined) {
      throw new Error("Réponse du modèle vide ou inattendue.");
    }
    return message;
  }

  throw new Error(dernierMotif === "" ? "Échec de l'appel au modèle." : dernierMotif);
}

// ─── La boucle ─────────────────────────────────────────────────────────────

function resumerProposition(entree: Record<string, unknown>): string {
  const sens = entree["sens"] === "vente" ? "Vendre" : "Acheter";
  const symbole = String(entree["symbole"] ?? "?");
  const montant = Number(entree["montant"] ?? 0);
  const prix = entree["prix_declencheur"];
  const cadence = entree["cadence"];

  if (typeof prix === "number") {
    return `${sens} ${montant} $ de ${symbole} si le prix atteint ${prix} $`;
  }
  if (typeof cadence === "string") {
    return `${sens} ${montant} $ de ${symbole}, ${cadence}`;
  }
  return `${sens} ${montant} $ de ${symbole}`;
}

function lireArguments(brut: string): Record<string, unknown> {
  try {
    const objet: unknown = JSON.parse(brut);
    return typeof objet === "object" && objet !== null
      ? (objet as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

router.post("/api/jarvis/ask", async (req: Request, res: Response) => {
  if (CLE === "") {
    res.status(503).json({
      erreur:
        "Jarvis n'a pas de cerveau : aucune clé de modèle dans l'environnement. " +
        "Ajoute GEMINI_API_KEY dans les Secrets de Replit, puis relance le serveur.",
    });
    return;
  }

  const corps = req.body as { texte?: unknown; historique?: unknown };
  const texte = typeof corps.texte === "string" ? corps.texte.trim() : "";
  if (texte === "") {
    res.status(400).json({ erreur: "Rien à traiter : le champ texte est vide." });
    return;
  }

  const historique: Tour[] = Array.isArray(corps.historique)
    ? (corps.historique as unknown[])
        .filter((t): t is Tour => {
          if (typeof t !== "object" || t === null) return false;
          const o = t as { role?: unknown; contenu?: unknown };
          return (
            (o.role === "user" || o.role === "assistant") && typeof o.contenu === "string"
          );
        })
        .slice(-MAX_HISTORIQUE)
    : [];

  const cookie = typeof req.headers.cookie === "string" ? req.headers.cookie : "";

  const messages: Message[] = [
    { role: "system", content: CONSIGNE },
    ...historique.map((t): Message => ({ role: t.role, content: t.contenu })),
    { role: "user", content: texte },
  ];

  const propositions: Proposition[] = [];
  const journal: string[] = [];

  try {
    for (let tour = 0; tour < MAX_TOURS; tour += 1) {
      const message = await appelerModele(messages);
      const appels = message.tool_calls ?? [];

      if (appels.length === 0) {
        res.json({ reponse: (message.content ?? "").trim(), propositions, journal });
        return;
      }

      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: appels,
      });

      for (const appel of appels) {
        const entree = lireArguments(appel.function.arguments);

        if (appel.function.name === "lire") {
          const chemin = typeof entree["chemin"] === "string" ? entree["chemin"] : "";
          journal.push(`lecture ${chemin}`);
          const contenu = await lireRessource(chemin, cookie);
          messages.push({ role: "tool", tool_call_id: appel.id, content: contenu });
          continue;
        }

        if (appel.function.name === "proposer_plan") {
          const resume = resumerProposition(entree);
          propositions.push({ genre: "plan", resume, corps: entree });
          journal.push(`proposition ${resume}`);
          messages.push({
            role: "tool",
            tool_call_id: appel.id,
            content:
              "La carte de confirmation est affichée à Lion. Rien n'est envoyé tant " +
              "qu'il n'a pas confirmé. Annonce-lui simplement ce que tu proposes.",
          });
          continue;
        }

        messages.push({
          role: "tool",
          tool_call_id: appel.id,
          content: `Outil inconnu : ${appel.function.name}`,
        });
      }
    }

    res.json({
      reponse:
        "Je me suis perdu en cherchant — trop d'allers-retours. Reformule en plus court ?",
      propositions,
      journal,
    });
  } catch (erreur) {
    const motif = erreur instanceof Error ? erreur.message : String(erreur);
    res.status(502).json({ erreur: motif, journal });
  }
});

// ─── La voix (ElevenLabs) ──────────────────────────────────────────────────
//
// La clé reste ici. Le navigateur envoie du texte et reçoit du son.

interface VoixElevenLabs {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
}

router.get("/api/jarvis/voix", async (_req: Request, res: Response) => {
  if (CLE_VOIX === "") {
    res.json({ disponible: false, voix: [] });
    return;
  }
  try {
    const reponse = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": CLE_VOIX },
    });
    if (!reponse.ok) {
      const detail = await reponse.text();
      res.status(502).json({
        disponible: false,
        voix: [],
        erreur: `ElevenLabs a répondu ${reponse.status} : ${detail.slice(0, 200)}`,
      });
      return;
    }
    const brut = (await reponse.json()) as { voices?: unknown };
    const liste = Array.isArray(brut.voices) ? (brut.voices as VoixElevenLabs[]) : [];
    res.json({
      disponible: true,
      voix: liste.map((v) => ({
        id: v.voice_id,
        nom: v.name,
        genre: v.labels?.["gender"] ?? "",
        accent: v.labels?.["accent"] ?? "",
      })),
    });
  } catch (erreur) {
    const motif = erreur instanceof Error ? erreur.message : String(erreur);
    res.status(502).json({ disponible: false, voix: [], erreur: motif });
  }
});

router.post("/api/jarvis/voix", async (req: Request, res: Response) => {
  if (CLE_VOIX === "") {
    res.status(503).json({
      erreur:
        "Pas de voix ElevenLabs : ELEVENLABS_API_KEY est absente. " +
        "La voix du navigateur prend le relais.",
    });
    return;
  }

  const corps = req.body as { texte?: unknown; voix?: unknown };
  const texte =
    typeof corps.texte === "string" ? corps.texte.trim().slice(0, MAX_CARACTERES_VOIX) : "";
  const voix = typeof corps.voix === "string" ? corps.voix : "";

  if (texte === "" || voix === "") {
    res.status(400).json({ erreur: "Il faut un texte et un identifiant de voix." });
    return;
  }
  if (!/^[A-Za-z0-9]{10,40}$/.test(voix)) {
    res.status(400).json({ erreur: "Identifiant de voix invalide." });
    return;
  }

  try {
    const reponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voix}`, {
      method: "POST",
      headers: {
        "xi-api-key": CLE_VOIX,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: texte,
        model_id: MODELE_VOIX,
        voice_settings: { stability: 0.4, similarity_boost: 0.8 },
      }),
    });

    if (!reponse.ok) {
      const detail = await reponse.text();
      res.status(502).json({
        erreur: `ElevenLabs a répondu ${reponse.status} : ${detail.slice(0, 200)}`,
      });
      return;
    }

    const audio = Buffer.from(await reponse.arrayBuffer());
    res.setHeader("content-type", "audio/mpeg");
    res.setHeader("cache-control", "no-store");
    res.send(audio);
  } catch (erreur) {
    const motif = erreur instanceof Error ? erreur.message : String(erreur);
    res.status(502).json({ erreur: motif });
  }
});

/** Sonde pour l'interface. Ne révèle aucune clé — seulement leur présence. */
router.get("/api/jarvis/etat", (_req: Request, res: Response) => {
  res.json({
    pret: CLE !== "",
    modele: MODELE,
    fournisseur: BASE,
    voixElevenLabs: CLE_VOIX !== "",
  });
});

export default router;
