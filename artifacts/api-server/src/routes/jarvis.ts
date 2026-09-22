import { Router, type IRouter, type Request, type Response } from "express";

/**
 * JARVIS — le cerveau conversationnel de Soliris.
 *
 * Principe de conception, et il n'est pas négociable :
 *
 *   Jarvis ne peut RIEN faire que toi, connecté, tu ne puisses déjà faire.
 *
 * Concrètement il n'accède pas à la base, pas au broker, pas à orderEngine.
 * Il appelle l'API de Soliris par HTTP, en réutilisant TON cookie de session.
 * Donc :
 *   - s'il n'est pas authentifié, il obtient 401 comme n'importe qui ;
 *   - il hérite exactement de tes droits, jamais plus ;
 *   - aucune route existante n'est modifiée pour lui.
 *
 * Et il est en LECTURE SEULE. La liste LECTURE_AUTORISEE plus bas est une
 * liste blanche : tout ce qui n'y est pas est refusé, et seul GET passe.
 * Quand Jarvis veut agir, il ne fait que PROPOSER — un objet structuré que
 * l'interface affiche et que tu confirmes d'un geste. La confirmation part
 * ensuite par POST /api/plans, le chemin déjà en place et déjà testé.
 */

const router: IRouter = Router();

// ─── Réglages ──────────────────────────────────────────────────────────────

const MODELE = process.env.JARVIS_MODELE ?? "claude-sonnet-4-5";
const CLE = process.env.ANTHROPIC_API_KEY ?? "";
const PORT_LOCAL = process.env.PORT ?? "5000";
const BASE_LOCALE = `http://127.0.0.1:${PORT_LOCAL}`;

const MAX_TOURS = 6; // garde-fou : au-delà, Jarvis tourne en rond
const MAX_HISTORIQUE = 12; // on ne renvoie pas toute la conversation à chaque fois

/**
 * Liste blanche des chemins que Jarvis peut lire. Fail-closed : un chemin
 * absent d'ici est refusé, même s'il existe dans l'API.
 */
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

// ─── Types ─────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";

interface Tour {
  role: Role;
  contenu: string;
}

interface BlocTexte {
  type: "text";
  text: string;
}

interface BlocOutil {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface BlocResultat {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type BlocSortie = BlocTexte | BlocOutil;
type BlocEntree = BlocTexte | BlocOutil | BlocResultat;

interface MessageApi {
  role: Role;
  content: string | BlocEntree[];
}

interface ReponseApi {
  content: BlocSortie[];
  stop_reason: string | null;
}

/** Une action que Jarvis suggère. Rien n'est exécuté tant que tu ne confirmes pas. */
interface Proposition {
  genre: "plan";
  resume: string;
  corps: Record<string, unknown>;
}

// ─── Les outils de Jarvis ──────────────────────────────────────────────────

const OUTILS = [
  {
    name: "lire",
    description:
      "Lit une ressource de l'API Soliris (GET uniquement). Utilise ceci pour " +
      "connaître le portefeuille, les positions, les prix, les plans, les signaux, " +
      "les actualités, la performance. Exemples de chemin : /api/portfolio, " +
      "/api/broker/allocation, /api/quotes?symbols=AAPL,BTC, /api/plans, /api/signals. " +
      "Si un chemin est refusé, n'insiste pas : dis-le simplement.",
    input_schema: {
      type: "object" as const,
      properties: {
        chemin: {
          type: "string" as const,
          description: "Chemin commençant par /api/, avec sa chaîne de requête si besoin.",
        },
      },
      required: ["chemin"],
    },
  },
  {
    name: "proposer_plan",
    description:
      "Prépare un ordre à cours limité ou un achat récurrent et le SOUMET À " +
      "L'APPROBATION DE LION. Ceci n'envoie aucun ordre : cela affiche une carte " +
      "qu'il doit confirmer d'un geste. Utilise-le dès qu'il demande d'acheter, " +
      "de vendre, de programmer un achat, ou de poser une limite. Ne demande jamais " +
      "de confirmation par la voix : la carte s'en charge.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string" as const,
          enum: ["limite", "recurrent"],
          description: "limite = déclenché par un prix. recurrent = déclenché par un calendrier.",
        },
        symbole: { type: "string" as const, description: "Ex. AAPL, BTC-USD." },
        sens: { type: "string" as const, enum: ["achat", "vente"] },
        montant: {
          type: "number" as const,
          description: "Montant en dollars à engager (pas un nombre de parts).",
        },
        prix_declencheur: {
          type: "number" as const,
          description: "Pour un plan à cours limité : le prix qui déclenche. Sinon, omets.",
        },
        cadence: {
          type: "string" as const,
          enum: ["quotidien", "hebdomadaire", "mensuel"],
          description: "Pour un plan récurrent. Sinon, omets.",
        },
        pourquoi: {
          type: "string" as const,
          description: "Une phrase : la raison, telle que tu l'expliquerais à Lion.",
        },
      },
      required: ["type", "symbole", "sens", "montant", "pourquoi"],
    },
  },
] as const;

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
confirmation est là pour ça, et le lui demander deux fois est agaçant.

Tu n'es pas son conseiller financier et tu ne fais pas semblant de l'être. Tu lui
donnes les faits dont il a besoin pour décider. S'il te demande si un achat est
une bonne idée, tu peux donner ce qui plaide pour et ce qui plaide contre, en
nommant ce que tu ignores — mais la décision reste la sienne.

Si quelque chose dans les données te paraît anormal — une position qui a fondu, un
plan qui s'est déclenché sans qu'il le sache — dis-le, même s'il n'a pas posé la
question.

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
    // On tronque : un portefeuille entier ferait exploser le contexte.
    return texte.length > 24_000 ? `${texte.slice(0, 24_000)}\n…(tronqué)` : texte;
  } catch (erreur) {
    const motif = erreur instanceof Error ? erreur.message : String(erreur);
    return `Lecture impossible de ${chemin} : ${motif}`;
  }
}

// ─── Appel au modèle ───────────────────────────────────────────────────────

async function appelerModele(messages: MessageApi[]): Promise<ReponseApi> {
  const reponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": CLE,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELE,
      max_tokens: 1024,
      system: CONSIGNE,
      tools: OUTILS,
      messages,
    }),
  });

  if (!reponse.ok) {
    const detail = await reponse.text();
    throw new Error(`Modèle indisponible (${reponse.status}) : ${detail.slice(0, 300)}`);
  }

  const brut = (await reponse.json()) as unknown;
  const objet = brut as { content?: unknown; stop_reason?: unknown };
  const contenu = Array.isArray(objet.content) ? (objet.content as BlocSortie[]) : [];
  const arret = typeof objet.stop_reason === "string" ? objet.stop_reason : null;
  return { content: contenu, stop_reason: arret };
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

router.post("/api/jarvis/ask", async (req: Request, res: Response) => {
  if (CLE === "") {
    res.status(503).json({
      erreur:
        "Jarvis n'a pas de cerveau : la variable ANTHROPIC_API_KEY est absente de " +
        "l'environnement. Ajoute-la dans les Secrets de Replit, puis relance.",
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

  const messages: MessageApi[] = [
    ...historique.map((t): MessageApi => ({ role: t.role, content: t.contenu })),
    { role: "user", content: texte },
  ];

  const propositions: Proposition[] = [];
  const journal: string[] = [];

  try {
    for (let tour = 0; tour < MAX_TOURS; tour += 1) {
      const reponse = await appelerModele(messages);

      const outils = reponse.content.filter((b): b is BlocOutil => b.type === "tool_use");

      if (outils.length === 0) {
        const dit = reponse.content
          .filter((b): b is BlocTexte => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        res.json({ reponse: dit, propositions, journal });
        return;
      }

      messages.push({ role: "assistant", content: reponse.content });

      const resultats: BlocEntree[] = [];
      for (const outil of outils) {
        const entree =
          typeof outil.input === "object" && outil.input !== null
            ? (outil.input as Record<string, unknown>)
            : {};

        if (outil.name === "lire") {
          const chemin = typeof entree["chemin"] === "string" ? entree["chemin"] : "";
          journal.push(`lecture ${chemin}`);
          const contenu = await lireRessource(chemin, cookie);
          resultats.push({ type: "tool_result", tool_use_id: outil.id, content: contenu });
          continue;
        }

        if (outil.name === "proposer_plan") {
          const resume = resumerProposition(entree);
          propositions.push({ genre: "plan", resume, corps: entree });
          journal.push(`proposition ${resume}`);
          resultats.push({
            type: "tool_result",
            tool_use_id: outil.id,
            content:
              "La carte de confirmation est affichée à Lion. Rien n'est envoyé tant " +
              "qu'il n'a pas confirmé. Annonce-lui simplement ce que tu proposes.",
          });
          continue;
        }

        resultats.push({
          type: "tool_result",
          tool_use_id: outil.id,
          content: `Outil inconnu : ${outil.name}`,
          is_error: true,
        });
      }

      messages.push({ role: "user", content: resultats });
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

/** Sonde pour l'interface : sait-on si Jarvis a un cerveau et une voix ? */
router.get("/api/jarvis/etat", (_req: Request, res: Response) => {
  res.json({ pret: CLE !== "", modele: MODELE });
});

export default router;
