/**
 * /copy-trading/decouvrir — Recherche et découverte de traders CopyFactory
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Search, ArrowLeft, Loader2, AlertCircle, UserPlus } from "lucide-react";
import TraderCard from "@/components/copyTrading/TraderCard";
import type { NormalizedTrader } from "@/lib/copyTradingTypes";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function CopyTradingDiscoverPage() {
  usePageMeta("Découvrir des traders — Soliris Market", "Recherchez des traders CopyFactory performants.");

  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  const searchQ = useQuery<NormalizedTrader[]>({
    queryKey: ["traders-search", submittedQuery],
    queryFn: () =>
      fetch(`${BASE}/api/copy-trading/traders/search?q=${encodeURIComponent(submittedQuery)}`).then(
        (r) => r.json(),
      ),
    enabled: true, // charge tous les traders par défaut
    staleTime: 60_000,
  });

  const followMut = useMutation({
    mutationFn: (trader: NormalizedTrader) =>
      fetch(`${BASE}/api/copy-trading/followed-traders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: trader.strategyId,
          traderDisplayName: trader.displayName,
        }),
      }).then((r) => r.json()),
    onSuccess: (_data, trader) => {
      setFollowedIds((prev) => new Set([...prev, trader.strategyId]));
      qc.invalidateQueries({ queryKey: ["followed-traders"] });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
  };

  const traders = Array.isArray(searchQ.data) ? searchQ.data : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Navigation */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/copy-trading">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="text-lg font-semibold">Découvrir des traders</h1>
      </div>

      {/* Barre de recherche */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom de stratégie…"
            className="w-full pl-9 pr-4 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Rechercher
        </button>
      </form>

      {/* Résultats */}
      {searchQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement des stratégies…
        </div>
      ) : searchQ.isError ? (
        <div className="flex items-center gap-2 text-sm text-destructive py-8">
          <AlertCircle className="w-4 h-4" />
          {String(searchQ.error)}
        </div>
      ) : traders.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-10 text-center">
          <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">
            {submittedQuery ? `Aucun résultat pour "${submittedQuery}".` : "Aucune stratégie disponible."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Assure-toi que METAAPI_TOKEN est configuré dans les secrets Replit.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            {traders.length} stratégie{traders.length > 1 ? "s" : ""} trouvée{traders.length > 1 ? "s" : ""}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {traders.map((trader) => {
              const alreadyFollowed = followedIds.has(trader.strategyId);
              return (
                <div key={trader.strategyId} className="relative">
                  <TraderCard
                    strategyId={trader.strategyId}
                    displayName={trader.displayName}
                    description={trader.description}
                    gainPct={trader.gainPct}
                    maxDrawdownPct={trader.maxDrawdownPct}
                    totalTrades={trader.totalTrades}
                    winRatePct={trader.winRatePct}
                    subscribers={trader.subscribers}
                  />
                  <div className="mt-2 px-1">
                    {alreadyFollowed ? (
                      <span className="text-xs text-emerald-500 font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Ajouté à ta liste de suivi
                      </span>
                    ) : (
                      <button
                        onClick={() => followMut.mutate(trader)}
                        disabled={followMut.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                      >
                        {followMut.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5" />
                        )}
                        Suivre ce trader
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
