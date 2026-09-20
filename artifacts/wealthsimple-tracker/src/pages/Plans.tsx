import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Info,
  Loader2,
  Play,
  Power,
  Repeat,
  Target,
  Trash2,
} from "lucide-react";

/**
 * Limites & récurrents.
 *
 * Deux façons de dire « achète sans que j'aie à regarder » : à un prix, ou à
 * une date. Les deux finissent dans le même tuyau que le bouton Acheter —
 * aucun ordre ne contourne les garde-fous existants.
 *
 * La page ne cache pas ce que le mécanisme n'est pas : un plan à cours limité
 * ne dort pas dans le carnet du courtier. Le dire à l'écran coûte trois
 * lignes ; ne pas le dire coûte la confiance le jour où ça glisse.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Genre = "limit" | "recurring";
type Cadence = "daily" | "weekly" | "monthly";

interface Plan {
  id: number;
  kind: Genre;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  limitPrice: number | null;
  cadence: Cadence | null;
  accountId: string | null;
  enabled: boolean;
  runsDone: number;
  maxRuns: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  createdAt: string;
}

interface Passage {
  planId: number;
  symbol: string;
  status: string;
  message: string;
}

async function appel(chemin: string, options?: RequestInit): Promise<unknown> {
  const r = await fetch(`${BASE}/api/${chemin}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const charge: unknown = await r.json().catch(() => null);
  if (!r.ok) {
    const message =
      charge !== null && typeof charge === "object" && "error" in charge
        ? String((charge as { error: unknown }).error)
        : `HTTP ${r.status}`;
    throw new Error(message);
  }
  return charge;
}

const CADENCES: { valeur: Cadence; libelle: string }[] = [
  { valeur: "daily", libelle: "Chaque jour" },
  { valeur: "weekly", libelle: "Chaque semaine" },
  { valeur: "monthly", libelle: "Chaque mois" },
];

export default function PlansPage() {
  usePageMeta(
    "Limites & récurrents",
    "Acheter à un prix, ou à une date, sans rester devant l'écran.",
  );

  const qc = useQueryClient();
  const { toast } = useToast();
  const [genre, setGenre] = useState<Genre>("limit");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [maxRuns, setMaxRuns] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [dernierPassage, setDernierPassage] = useState<Passage[] | null>(null);

  const plansQ = useQuery<{ plans: Plan[] }>({
    queryKey: ["plans"],
    queryFn: () => appel("plans") as Promise<{ plans: Plan[] }>,
    refetchInterval: 60_000,
  });

  const creer = useMutation({
    mutationFn: async () => {
      const corps: Record<string, unknown> = {
        kind: genre,
        symbol: symbol.trim().toUpperCase(),
        side,
        quantity: Number(quantity),
      };
      if (genre === "limit") corps.limitPrice = Number(limitPrice);
      else corps.cadence = cadence;
      if (maxRuns.trim() !== "") corps.maxRuns = Number(maxRuns);
      return appel("plans", { method: "POST", body: JSON.stringify(corps) });
    },
    onSuccess: () => {
      setErreur(null);
      setSymbol("");
      setQuantity("");
      setLimitPrice("");
      setMaxRuns("");
      void qc.invalidateQueries({ queryKey: ["plans"] });
      toast({ title: "Plan créé", description: "Il est éteint. Allume-le quand tu es prêt." });
    },
    onError: (e) => setErreur(e instanceof Error ? e.message : String(e)),
  });

  const basculer = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      appel(`plans/${id}/enabled`, {
        method: "POST",
        body: JSON.stringify({ enabled, acknowledged: enabled ? true : undefined }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plans"] }),
    onError: (e) => setErreur(e instanceof Error ? e.message : String(e)),
  });

  const supprimer = useMutation({
    mutationFn: async (id: number) => appel(`plans/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plans"] }),
    onError: (e) => setErreur(e instanceof Error ? e.message : String(e)),
  });

  const verifier = useMutation({
    mutationFn: async () =>
      appel("plans/run-due", { method: "POST" }) as Promise<{ results: Passage[] }>,
    onSuccess: (d) => {
      setDernierPassage(d.results);
      void qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e) => setErreur(e instanceof Error ? e.message : String(e)),
  });

  const plans = plansQ.data?.plans ?? [];
  const allumes = plans.filter((p) => p.enabled).length;

  return (
    <div className="p-6 md:p-8 space-y-6">

      {erreur && (
        <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm bg-destructive/10 border border-destructive/25 text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {erreur}
        </div>
      )}

      {/* — Ce que c'est, et ce que ce n'est pas — */}
      <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            Un plan surveille, puis envoie un ordre <strong className="text-foreground/90">au marché</strong> par
            le même chemin que le bouton Acheter — donc avec les mêmes garde-fous.
          </p>
          <p>
            <strong className="text-foreground/90">Ce n&apos;est pas un vrai ordre limite.</strong> Il ne dort pas
            dans le carnet du courtier, il ne garantit pas le prix, et il ne se
            déclenche que quand le serveur passe la revue. Le prix obtenu peut
            différer du seuil.
          </p>
        </div>
      </div>

      {/* — Créer un plan — */}
      <div className="surface-glass rounded-xl p-6 md:p-8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Nouveau plan
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {([["limit", "À un prix", Target], ["recurring", "À une date", Repeat]] as const).map(
            ([valeur, libelle, Icone]) => (
              <button
                key={valeur}
                type="button"
                onClick={() => setGenre(valeur)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${
                  genre === valeur
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border/60 text-muted-foreground hover:border-border hover:bg-muted/30"
                }`}
              >
                <Icone className="w-3.5 h-3.5" />
                {libelle}
              </button>
            ),
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Champ label="Symbole" value={symbol} onChange={setSymbol} placeholder="AAPL" />
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wide text-foreground/80">Sens</span>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value === "sell" ? "sell" : "buy")}
              className="w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm"
            >
              <option value="buy">Acheter</option>
              <option value="sell">Vendre</option>
            </select>
          </label>
          <Champ label="Quantité" value={quantity} onChange={setQuantity} placeholder="10" />
          {genre === "limit" ? (
            <Champ
              label={side === "buy" ? "Acheter si le prix descend à" : "Vendre si le prix monte à"}
              value={limitPrice}
              onChange={setLimitPrice}
              placeholder="180.00"
            />
          ) : (
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-foreground/80">Cadence</span>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as Cadence)}
                className="w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm"
              >
                {CADENCES.map((c) => (
                  <option key={c.valeur} value={c.valeur}>{c.libelle}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {genre === "recurring" && (
          <div className="mt-4 max-w-xs">
            <Champ
              label="Arrêter après (passages, facultatif)"
              value={maxRuns}
              onChange={setMaxRuns}
              placeholder="12"
            />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => creer.mutate()}
            disabled={creer.isPending || symbol.trim() === "" || quantity.trim() === ""}
            className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-md bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creer.isPending ? "Création…" : "Créer le plan"}
          </button>
          <span className="text-[11px] text-muted-foreground">
            Le plan naît éteint. Rien ne part tant que tu ne l&apos;allumes pas.
          </span>
        </div>
      </div>

      {/* — Les plans — */}
      <div className="surface-glass rounded-xl p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Plans — {allumes} allumé{allumes > 1 ? "s" : ""} sur {plans.length}
          </p>
          <button
            type="button"
            onClick={() => verifier.mutate()}
            disabled={verifier.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted/30 disabled:opacity-40"
          >
            {verifier.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Vérifier maintenant
          </button>
        </div>

        {plansQ.isLoading ? (
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </p>
        ) : plans.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">Aucun plan pour l&apos;instant.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="text-left py-2">Plan</th>
                  <th className="text-right py-2">Quantité</th>
                  <th className="text-right py-2">Déclencheur</th>
                  <th className="text-right py-2">Passages</th>
                  <th className="text-left py-2 pl-6">Dernier passage</th>
                  <th className="text-right py-2">État</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-t border-border/30">
                    <td className="py-3">
                      <div className="font-medium text-foreground/90">
                        {p.side === "buy" ? "Acheter" : "Vendre"} {p.symbol}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.kind === "limit" ? "À un prix" : "Récurrent"}
                      </div>
                    </td>
                    <td className="py-3 text-right tabular-nums">{p.quantity}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">
                      {p.kind === "limit"
                        ? `${p.side === "buy" ? "≤" : "≥"} ${p.limitPrice?.toFixed(2)}`
                        : CADENCES.find((c) => c.valeur === p.cadence)?.libelle ?? "—"}
                    </td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">
                      {p.runsDone}{p.maxRuns !== null && ` / ${p.maxRuns}`}
                    </td>
                    <td className="py-3 pl-6 text-[11px] text-muted-foreground max-w-xs">
                      {p.lastStatus === null ? "—" : (
                        <>
                          <span className={
                            p.lastStatus === "envoye" ? "text-emerald-400"
                              : p.lastStatus === "refuse" || p.lastStatus === "erreur" ? "text-destructive"
                                : "text-muted-foreground"
                          }>
                            {p.lastStatus}
                          </span>
                          {p.lastMessage && <> — {p.lastMessage}</>}
                        </>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => basculer.mutate({ id: p.id, enabled: !p.enabled })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors ${
                          p.enabled
                            ? "bg-primary/15 text-primary hover:bg-primary/25"
                            : "border border-border/60 text-muted-foreground hover:bg-muted/30"
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        {p.enabled ? "Allumé" : "Éteint"}
                      </button>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => supprimer.mutate(p.id)}
                        title="Supprimer ce plan"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dernierPassage !== null && (
          <div className="mt-5 border-t border-border/30 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Revue du {new Date().toLocaleTimeString("fr-CA")}
            </p>
            {dernierPassage.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Aucun plan allumé.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {dernierPassage.map((r) => (
                  <li key={r.planId}>
                    <span className="font-medium text-foreground/80">{r.symbol}</span> — {r.status} : {r.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        La revue ne tourne pas encore toute seule : elle s&apos;exécute quand tu cliques
        « Vérifier maintenant », ou quand quelque chose appelle{" "}
        <code className="text-foreground/70">POST /api/plans/run-due</code>. Tant qu&apos;elle
        n&apos;est pas branchée sur le planificateur, un plan récurrent ne partira pas de
        lui-même — c&apos;est volontaire.
      </p>
    </div>
  );
}

function Champ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (valeur: string) => void;
  placeholder?: string | undefined;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold tracking-wide text-foreground/80">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}
