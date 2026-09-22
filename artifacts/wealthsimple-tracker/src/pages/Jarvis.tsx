import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff, Volume2, VolumeX, Check, X, Loader2, Radio } from "lucide-react";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useToast } from "@/hooks/use-toast";

/**
 * JARVIS — l'interface vocale de Soliris.
 *
 * Tout ce qui parle et tout ce qui écoute vit ici, dans le navigateur :
 * la reconnaissance vocale et la synthèse sont natives (Web Speech API),
 * donc zéro dépendance, zéro clé, et ça marche sur Chrome comme sur Android.
 *
 * Le serveur, lui, ne voit que du texte. C'est voulu : ta voix ne quitte
 * jamais ton appareil.
 */

// ─── La Web Speech API n'est pas typée par TypeScript. On déclare le strict ──
// ─── minimum, sans toucher aux types globaux du projet. ─────────────────────

interface ResultatVocal {
  readonly isFinal: boolean;
  readonly length: number;
  item: (index: number) => { readonly transcript: string };
  [index: number]: { readonly transcript: string } | undefined;
}

interface EvenementVocal {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: ResultatVocal | undefined;
  };
}

interface MoteurVocal {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: EvenementVocal) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type FabriqueVocale = new () => MoteurVocal;

function obtenirFabrique(): FabriqueVocale | null {
  const w = window as unknown as {
    SpeechRecognition?: FabriqueVocale;
    webkitSpeechRecognition?: FabriqueVocale;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─── Types d'échange ────────────────────────────────────────────────────────

interface Proposition {
  genre: "plan";
  resume: string;
  corps: Record<string, unknown>;
}

interface Tour {
  role: "user" | "assistant";
  contenu: string;
}

interface ReponseJarvis {
  reponse: string;
  propositions: Proposition[];
  journal: string[];
}

// ─── Synthèse vocale ────────────────────────────────────────────────────────

function parler(texte: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const enonce = new SpeechSynthesisUtterance(texte);
  enonce.lang = "fr-CA";
  enonce.rate = 1.05;
  enonce.pitch = 0.95;
  const voix = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.startsWith("fr"));
  if (voix !== undefined) enonce.voice = voix;
  window.speechSynthesis.speak(enonce);
}

function taire(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function JarvisPage() {
  usePageMeta("Jarvis - Soliris Market", "Assistant vocal : lecture du portefeuille et preparation des ordres.");
  const { toast } = useToast();

  const [ecoute, setEcoute] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [reflechit, setReflechit] = useState(false);
  const [voixActive, setVoixActive] = useState(true);
  const [echanges, setEchanges] = useState<Tour[]>([]);
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [journal, setJournal] = useState<string[]>([]);

  const moteur = useRef<MoteurVocal | null>(null);
  const finDeParole = useRef<number | null>(null);
  const basDePage = useRef<HTMLDivElement | null>(null);

  const etat = useQuery<{ pret: boolean; modele: string }>({
    queryKey: ["/api/jarvis/etat"],
  });

  useEffect(() => {
    basDePage.current?.scrollIntoView({ behavior: "smooth" });
  }, [echanges, propositions, reflechit]);

  // ── Envoi au cerveau ──────────────────────────────────────────────────────

  const demander = useCallback(
    async (texte: string) => {
      const propre = texte.trim();
      if (propre === "") return;

      const avant = echanges;
      setEchanges([...avant, { role: "user", contenu: propre }]);
      setTranscription("");
      setPropositions([]);
      setReflechit(true);

      try {
        const reponse = await fetch("/api/jarvis/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ texte: propre, historique: avant }),
        });

        const donnees = (await reponse.json()) as ReponseJarvis & { erreur?: string };

        if (!reponse.ok) {
          toast({
            title: "Jarvis n'a pas pu répondre",
            description: donnees.erreur ?? `Erreur ${reponse.status}`,
            variant: "destructive",
          });
          return;
        }

        setEchanges((precedent) => [
          ...precedent,
          { role: "assistant", contenu: donnees.reponse },
        ]);
        setPropositions(donnees.propositions);
        setJournal(donnees.journal);
        if (voixActive && donnees.reponse !== "") parler(donnees.reponse);
      } catch (erreur) {
        toast({
          title: "Connexion perdue",
          description: erreur instanceof Error ? erreur.message : "Réessaie.",
          variant: "destructive",
        });
      } finally {
        setReflechit(false);
      }
    },
    [echanges, voixActive, toast],
  );

  // ── Écoute ────────────────────────────────────────────────────────────────

  const arreterEcoute = useCallback(() => {
    moteur.current?.stop();
    setEcoute(false);
  }, []);

  const demarrerEcoute = useCallback(() => {
    const Fabrique = obtenirFabrique();
    if (Fabrique === null) {
      toast({
        title: "Ce navigateur n'entend pas",
        description:
          "La reconnaissance vocale existe sur Chrome, Edge et Chrome Android. " +
          "Sur Firefox et iOS, écris à Jarvis — il répondra pareil.",
        variant: "destructive",
      });
      return;
    }

    taire();
    const m = new Fabrique();
    m.lang = "fr-CA";
    m.continuous = true;
    m.interimResults = true;

    m.onresult = (e: EvenementVocal) => {
      let accumule = "";
      for (let i = 0; i < e.results.length; i += 1) {
        const resultat = e.results[i];
        if (resultat === undefined) continue;
        const premier = resultat[0];
        if (premier === undefined) continue;
        accumule += premier.transcript;
      }
      setTranscription(accumule);

      // Deux secondes de silence : on considère la phrase finie et on envoie.
      if (finDeParole.current !== null) window.clearTimeout(finDeParole.current);
      finDeParole.current = window.setTimeout(() => {
        const phrase = accumule.trim();
        m.stop();
        setEcoute(false);
        if (phrase !== "") void demander(phrase);
      }, 2000);
    };

    m.onerror = (e: { error: string }) => {
      setEcoute(false);
      if (e.error === "not-allowed") {
        toast({
          title: "Micro refusé",
          description: "Autorise le microphone dans la barre d'adresse, puis réessaie.",
          variant: "destructive",
        });
      }
    };

    m.onend = () => setEcoute(false);

    moteur.current = m;
    m.start();
    setEcoute(true);
  }, [demander, toast]);

  useEffect(
    () => () => {
      if (finDeParole.current !== null) window.clearTimeout(finDeParole.current);
      moteur.current?.abort();
      taire();
    },
    [],
  );

  // ── Confirmation d'une proposition ────────────────────────────────────────

  const confirmer = useCallback(
    async (proposition: Proposition) => {
      try {
        const reponse = await fetch("/api/plans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(proposition.corps),
        });
        if (!reponse.ok) {
          const detail = await reponse.text();
          throw new Error(detail.slice(0, 200));
        }
        toast({
          title: "Plan créé",
          description: `${proposition.resume}. Il reste désactivé : va l'activer dans Limites & récurrents.`,
        });
        setPropositions((p) => p.filter((x) => x !== proposition));
      } catch (erreur) {
        toast({
          title: "Création refusée",
          description: erreur instanceof Error ? erreur.message : "Réessaie.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const cerveauAbsent = etat.data !== undefined && !etat.data.pret;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 p-4">
      {/* En-tête */}
      <div className="surface-glass flex items-center justify-between rounded-lg border border-border/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Radio
            className={`h-4 w-4 ${ecoute ? "animate-pulse text-emerald-400" : "text-muted-foreground"}`}
          />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Jarvis
            </div>
            <div className="text-xs text-muted-foreground">
              {ecoute
                ? "à l'écoute"
                : reflechit
                  ? "réfléchit"
                  : cerveauAbsent
                    ? "hors ligne"
                    : "en veille"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (voixActive) taire();
            setVoixActive((v) => !v);
          }}
          className="rounded-md border border-border/30 p-2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={voixActive ? "Couper la voix" : "Activer la voix"}
        >
          {voixActive ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>

      {cerveauAbsent && (
        <div className="surface-glass rounded-lg border border-amber-500/30 px-4 py-3 text-xs text-amber-200">
          Jarvis n'a pas de cerveau : la variable <code>ANTHROPIC_API_KEY</code> est
          absente. Ajoute-la dans les Secrets de Replit, puis recharge la page.
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {echanges.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Appuie sur le micro et parle.
            </p>
            <p className="mt-2 text-xs text-muted-foreground/60">
              « Combien j'ai en ce moment ? » · « Est-ce que Nvidia a bougé ? » ·
              « Prépare-moi un achat de cent dollars de Bitcoin chaque lundi »
            </p>
          </div>
        )}

        {echanges.map((tour, i) => (
          <div
            key={`${tour.role}-${i}`}
            className={tour.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                tour.role === "user"
                  ? "max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm"
                  : "surface-glass max-w-[85%] rounded-lg border border-border/30 px-3 py-2 text-sm"
              }
            >
              {tour.contenu}
            </div>
          </div>
        ))}

        {transcription !== "" && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-lg bg-primary/5 px-3 py-2 text-sm italic text-muted-foreground">
              {transcription}
            </div>
          </div>
        )}

        {reflechit && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {journal.length > 0 ? journal[journal.length - 1] : "…"}
          </div>
        )}

        {/* Cartes à confirmer */}
        {propositions.map((proposition, i) => (
          <div
            key={`prop-${i}`}
            className="surface-glass rounded-lg border border-emerald-500/40 p-4"
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              À confirmer
            </div>
            <div className="mt-2 text-sm tabular-nums">{proposition.resume}</div>
            {typeof proposition.corps["pourquoi"] === "string" && (
              <div className="mt-1 text-xs text-muted-foreground">
                {String(proposition.corps["pourquoi"])}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void confirmer(proposition)}
                className="flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/30"
              >
                <Check className="h-3 w-3" />
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => setPropositions((p) => p.filter((x) => x !== proposition))}
                className="flex items-center gap-1.5 rounded-md border border-border/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Laisser tomber
              </button>
            </div>
          </div>
        ))}

        <div ref={basDePage} />
      </div>

      {/* Barre du bas */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={ecoute ? arreterEcoute : demarrerEcoute}
          disabled={reflechit || cerveauAbsent}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-40 ${
            ecoute
              ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/40"
              : "bg-primary/15 text-primary hover:bg-primary/25"
          }`}
          aria-label={ecoute ? "Arrêter" : "Parler"}
        >
          {ecoute ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const champ = e.currentTarget.elements.namedItem("saisie");
            if (champ instanceof HTMLInputElement) {
              const valeur = champ.value;
              champ.value = "";
              void demander(valeur);
            }
          }}
        >
          <input
            name="saisie"
            type="text"
            placeholder="…ou écris"
            disabled={reflechit || cerveauAbsent}
            className="w-full rounded-lg border border-border/30 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-border disabled:opacity-40"
          />
        </form>
      </div>
    </div>
  );
}
