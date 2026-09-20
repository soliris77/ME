import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Minus,
  RefreshCw,
  Wallet,
} from "lucide-react";

/**
 * Portefeuille — ce que tu possèdes, ce que tu l'as payé, ce que ça vaut.
 *
 * La page Courtier montre la répartition. Celle-ci montre le mouvement : pour
 * chaque titre, le prix moyen payé face au prix d'aujourd'hui, et l'écart en
 * dollars comme en pourcentage.
 *
 * Deux règles d'affichage, tenues partout :
 *   — un montant dont on ne connaît pas le coût n'affiche pas « 0 % », il
 *     affiche un tiret et se signale ;
 *   — tout montant sensible porte la classe `sensitive`, pour que le mode
 *     confidentialité de la barre latérale le floute vraiment.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Position {
  symbol: string;
  description: string | null;
  units: number;
  price: number;
  currency: string;
  marketValue: number;
  marketValueCad: number | null;
  avgCost: number | null;
  costBasis: number | null;
  costBasisCad: number | null;
  pnl: number | null;
  pnlCad: number | null;
  pnlPct: number | null;
  hasCost: boolean;
}

interface Totaux {
  marketValueCad: number;
  cashCad: number;
  totalCad: number;
  costBasisCad: number | null;
  pnlCad: number | null;
  pnlPct: number | null;
  cashPct: number;
  positionsSansCout: number;
}

interface Portefeuille {
  connected: boolean;
  reason?: string;
  message?: string;
  empty?: boolean;
  asOf?: string;
  lastSyncedAt?: string | null;
  baseCurrency?: string;
  fxRates?: Record<string, number>;
  fxWarning?: string | null;
  accountErrors?: { accountId: string; name: string | null; error: string }[];
  totals?: Totaux;
  cashByCurrency?: { currency: string; amount: number; amountCad: number | null }[];
  positions?: Position[];
}

type Devise = "CAD" | "USD";

export default function PortefeuillePage() {
  usePageMeta(
    "Portefeuille",
    "Ce que tu possèdes, ce que tu l'as payé, ce que ça vaut aujourd'hui.",
  );

  const [devise, setDevise] = useState<Devise>("CAD");

  const q = useQuery<Portefeuille>({
    queryKey: ["portefeuille"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/portfolio`, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Portefeuille;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  /**
   * Le serveur travaille en CAD. Passer en USD, c'est diviser par le taux
   * USD→CAD. Si ce taux manque, on ne devine pas : on reste en CAD et on le
   * dit au lieu d'afficher des chiffres faux.
   */
  const tauxUsd = q.data?.fxRates?.["USD"] ?? null;
  const conversionPossible = tauxUsd !== null && tauxUsd > 0;
  const deviseActive: Devise = devise === "USD" && conversionPossible ? "USD" : "CAD";

  const enDevise = useMemo(() => {
    return (montantCad: number | null): number | null => {
      if (montantCad === null) return null;
      if (deviseActive === "CAD") return montantCad;
      return montantCad / (tauxUsd as number);
    };
  }, [deviseActive, tauxUsd]);

  const argent = (montantCad: number | null): string => {
    const v = enDevise(montantCad);
    if (v === null) return "—";
    return `${v.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${deviseActive}`;
  };

  if (q.isLoading) {
    return (
      <div className="p-6 md:p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement du portefeuille…
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="p-6 md:p-8">
        <Avertissement>
          Impossible de lire le portefeuille. Le serveur a refusé la requête.
        </Avertissement>
      </div>
    );
  }

  const d = q.data;

  if (!d.connected) {
    return (
      <div className="p-6 md:p-8">
        <Avertissement>
          {d.message ?? "Courtier non connecté."}
        </Avertissement>
      </div>
    );
  }

  const totals = d.totals;
  const positions = d.positions ?? [];
  const gain = totals?.pnlCad ?? null;
  const gainPct = totals?.pnlPct ?? null;

  return (
    <div className="p-6 md:p-8 space-y-6">

      {/* — Le chiffre qui compte — */}
      <div className="surface-glass rounded-xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Wallet className="w-3.5 h-3.5" /> Valeur totale
            </p>
            <p className="sensitive mt-2 text-4xl font-semibold tabular-nums text-foreground">
              {argent(totals?.totalCad ?? null)}
            </p>
            {gain !== null && (
              <p
                className={`sensitive mt-2 flex items-center gap-1.5 text-sm font-semibold tabular-nums ${
                  gain > 0 ? "text-emerald-400" : gain < 0 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                <Fleche valeur={gain} />
                {argent(gain)}
                {gainPct !== null && (
                  <span className="opacity-80">({gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)} %)</span>
                )}
                <span className="font-normal text-muted-foreground">depuis l&apos;achat</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border/60 overflow-hidden">
              {(["CAD", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDevise(c)}
                  disabled={c === "USD" && !conversionPossible}
                  title={c === "USD" && !conversionPossible ? "Taux USD→CAD indisponible" : undefined}
                  className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    deviseActive === c
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
              className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted/30 disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${q.isFetching ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Chiffre libelle="Investi" valeur={argent(totals?.marketValueCad ?? null)} />
          <Chiffre libelle="Payé" valeur={argent(totals?.costBasisCad ?? null)} />
          <Chiffre
            libelle="Espèces"
            valeur={argent(totals?.cashCad ?? null)}
            note={totals ? `${totals.cashPct.toFixed(1)} % du total` : undefined}
          />
        </div>

        {deviseActive === "USD" && (
          <p className="mt-4 text-[11px] text-muted-foreground">
            Converti depuis le CAD au taux {tauxUsd?.toFixed(4)} — c&apos;est un affichage,
            pas une conversion réelle de tes avoirs.
          </p>
        )}
      </div>

      {d.fxWarning && <Avertissement>{d.fxWarning}</Avertissement>}

      {totals !== undefined && totals.positionsSansCout > 0 && (
        <Avertissement>
          {totals.positionsSansCout} position{totals.positionsSansCout > 1 ? "s" : ""} sans
          prix d&apos;achat connu — le courtier ne le transmet pas. Ces lignes sont
          exclues du gain total plutôt que comptées à zéro.
        </Avertissement>
      )}

      {(d.accountErrors ?? []).length > 0 && (
        <Avertissement>
          {(d.accountErrors ?? []).length} compte(s) n&apos;ont pas pu être lus. Les totaux
          ci-dessus sont donc incomplets.
        </Avertissement>
      )}

      {/* — Ligne par ligne — */}
      {positions.length === 0 ? (
        <div className="surface-glass rounded-xl p-6 text-sm text-muted-foreground">
          Aucune position. {d.message ?? ""}
        </div>
      ) : (
        <div className="surface-glass rounded-xl p-6 md:p-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Tes positions
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="text-left py-2">Titre</th>
                  <th className="text-right py-2">Quantité</th>
                  <th className="text-right py-2">Prix payé</th>
                  <th className="text-right py-2">Prix actuel</th>
                  <th className="text-right py-2">Valeur</th>
                  <th className="text-right py-2">Gain / perte</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={`${p.symbol}-${p.currency}`} className="border-t border-border/30">
                    <td className="py-3">
                      <div className="font-medium text-foreground/90">{p.symbol}</div>
                      {p.description && (
                        <div className="text-[11px] text-muted-foreground line-clamp-1">
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right tabular-nums sensitive">
                      {p.units.toLocaleString("fr-CA", { maximumFractionDigits: 6 })}
                    </td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">
                      {p.avgCost === null
                        ? "—"
                        : `${p.avgCost.toFixed(2)} ${p.currency}`}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {p.price.toFixed(2)} {p.currency}
                    </td>
                    <td className="py-3 text-right tabular-nums sensitive">
                      {argent(p.marketValueCad)}
                    </td>
                    <td className="py-3 text-right tabular-nums sensitive">
                      {p.pnlCad === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            p.pnlCad > 0
                              ? "text-emerald-400"
                              : p.pnlCad < 0
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }
                        >
                          {argent(p.pnlCad)}
                          {p.pnlPct !== null && (
                            <span className="ml-1.5 opacity-80">
                              ({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(1)} %)
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(d.cashByCurrency ?? []).length > 0 && (
            <div className="mt-6 border-t border-border/30 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Espèces
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {(d.cashByCurrency ?? []).map((c) => (
                  <span key={c.currency} className="sensitive tabular-nums text-foreground/80">
                    {c.amount.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    {c.currency}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {d.asOf && (
        <p className="text-[11px] text-muted-foreground">
          Relevé du {new Date(d.asOf).toLocaleString("fr-CA")}
          {d.lastSyncedAt && ` · dernière synchronisation courtier ${new Date(d.lastSyncedAt).toLocaleString("fr-CA")}`}
        </p>
      )}
    </div>
  );
}

function Fleche({ valeur }: { valeur: number }) {
  if (valeur > 0) return <ArrowUpRight className="w-4 h-4 shrink-0" />;
  if (valeur < 0) return <ArrowDownRight className="w-4 h-4 shrink-0" />;
  return <Minus className="w-4 h-4 shrink-0" />;
}

function Chiffre({
  libelle,
  valeur,
  note,
}: {
  libelle: string;
  valeur: string;
  note?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-border/40 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {libelle}
      </p>
      <p className="sensitive mt-1 text-sm font-semibold tabular-nums text-foreground/90">
        {valeur}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function Avertissement({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
