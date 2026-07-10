import {
  useGetWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useGetQuotes,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatPrice, formatPercent, changeClass, isUp } from "@/lib/format";
import { Link } from "wouter";
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Bookmark, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { WatchlistItem } from "@workspace/api-client-react";

function AddSymbolModal({ onClose }: { onClose: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const add = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: "Ajouté à votre liste de suivi" });
        onClose();
      },
      onError: () => toast({ title: "Erreur ou symbole déjà suivi", variant: "destructive" }),
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">Ajouter un actif</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Symbole boursier</label>
            <input
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono uppercase"
              placeholder="ex: XEQT.TO, AAPL, BTC-USD"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">Utilisez la <Link href="/search" className="text-primary hover:underline">recherche</Link> pour trouver un symbole.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Nom (optionnel)</label>
            <input
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="ex: iShares Core Equity ETF"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors">
            Annuler
          </button>
          <button
            onClick={() => add.mutate({ data: { symbol, name: name || symbol } })}
            disabled={!symbol || add.isPending}
            className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {add.isPending ? "Ajout..." : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const [showAdd, setShowAdd] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: watchlist = [], isLoading } = useGetWatchlist({ query: { refetchInterval: 30_000 } as any });
  const symbols = watchlist.map((w: WatchlistItem) => w.symbol).join(",");
  const { data: quotes = [] } = useGetQuotes(
    { symbols },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: symbols.length > 0, refetchInterval: 10_000 } as any }
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const remove = useRemoveFromWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: "Retiré de la liste de suivi" });
      },
    },
  });

  const quoteMap = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  return (
    <div className="p-6 max-w-3xl">
      {showAdd && <AddSymbolModal onClose={() => setShowAdd(false)} />}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Portefeuille suivi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{watchlist.length} actif{watchlist.length !== 1 ? "s" : ""} surveillé{watchlist.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Ajouter un actif
        </button>
      </div>

      {isLoading ? (
        <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 flex justify-between animate-pulse">
              <div><div className="h-4 bg-muted rounded w-20 mb-2" /><div className="h-3 bg-muted rounded w-40" /></div>
              <div><div className="h-4 bg-muted rounded w-24 mb-1" /><div className="h-3 bg-muted rounded w-16 ml-auto" /></div>
            </div>
          ))}
        </div>
      ) : watchlist.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center">
          <Bookmark className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold text-foreground mb-1">Votre liste est vide</p>
          <p className="text-sm text-muted-foreground mb-4">Ajoutez des actions, FNB ou cryptos pour suivre leurs prix en temps réel.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Ajouter votre premier actif
          </button>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-lg overflow-hidden divide-y divide-border">
          {watchlist.map((item: WatchlistItem) => {
            const q = quoteMap[item.symbol];
            const cls = q ? changeClass(q.changePercent) : "";
            const up = q ? isUp(q.changePercent) : false;
            return (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors group">
                <Link href={`/quote/${encodeURIComponent(item.symbol)}`} className="flex-1 flex items-center justify-between cursor-pointer">
                  <div className="min-w-0">
                    <div className="text-sm font-bold font-mono text-foreground">{item.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-52">{item.name}</div>
                    {item.note && <div className="text-xs text-muted-foreground/70 mt-0.5 italic truncate max-w-52">{item.note}</div>}
                  </div>
                  {q ? (
                    <div className="text-right ml-4">
                      <div className="text-sm font-mono font-semibold">{formatPrice(q.price, q.currency)}</div>
                      <div className={`text-xs font-mono ${cls} flex items-center justify-end gap-0.5`}>
                        {up === true && <ArrowUpRight className="w-3 h-3" />}
                        {up === false && <ArrowDownRight className="w-3 h-3" />}
                        {formatPercent(q.changePercent)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-right"><div className="h-4 bg-muted rounded w-20 animate-pulse" /></div>
                  )}
                </Link>
                <button
                  onClick={() => remove.mutate({ id: item.id })}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                  title="Retirer de la liste"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
