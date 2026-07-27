import {
  useGetWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useUpdateWatchlistItem,
  useGetQuotes,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { playSound } from "@/lib/sounds";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { formatPrice, formatPercent, changeClass, isUp } from "@/lib/format";
import { Link, useLocation } from "wouter";
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Bookmark, X, FolderInput, ListPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { WatchlistItem } from "@workspace/api-client-react";

const DEFAULT_LIST = "Général";

function AddSymbolModal({ existingLists, onClose }: { existingLists: string[]; onClose: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [listName, setListName] = useState(existingLists[0] ?? DEFAULT_LIST);
  const [customList, setCustomList] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const add = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        playSound("success");
        toast({ title: "Ajouté à votre liste de suivi" });
        onClose();
      },
      onError: () => { playSound("error"); toast({ title: "Erreur ou symbole déjà suivi", variant: "destructive" }); },
    },
  });

  const finalListName = creatingList ? (customList.trim() || DEFAULT_LIST) : listName;

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
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Liste</label>
            {!creatingList ? (
              <div className="flex gap-2">
                <select
                  className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                >
                  {existingLists.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingList(true)}
                  title="Nouvelle liste"
                  className="px-2.5 border border-border rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <ListPlus className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Nom de la nouvelle liste"
                  value={customList}
                  onChange={(e) => setCustomList(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setCreatingList(false)}
                  className="px-2.5 border border-border rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors">
            Annuler
          </button>
          <button
            onClick={() => add.mutate({ data: { symbol, name: name || symbol, listName: finalListName } })}
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

function MoveListMenu({ item, lists, onMove, onCreateNew }: {
  item: WatchlistItem;
  lists: string[];
  onMove: (listName: string) => void;
  onCreateNew: (listName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-all"
        title="Déplacer vers une autre liste"
      >
        <FolderInput className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 w-48 bg-card border border-card-border rounded-lg shadow-xl py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {!creating ? (
            <>
              {lists.filter((l) => l !== item.listName).map((l) => (
                <button
                  key={l}
                  onClick={() => { onMove(l); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors truncate"
                >
                  {l}
                </button>
              ))}
              <button
                onClick={() => setCreating(true)}
                className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-muted transition-colors flex items-center gap-1.5 border-t border-border mt-1 pt-2"
              >
                <ListPlus className="w-3 h-3" /> Nouvelle liste…
              </button>
            </>
          ) : (
            <div className="px-2 py-1.5 flex gap-1">
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && value.trim()) { onCreateNew(value.trim()); setOpen(false); }
                }}
                className="flex-1 px-2 py-1 text-xs bg-background border border-input rounded"
                placeholder="Nom…"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Watchlist() {
  const [showAdd, setShowAdd] = useState(false);
  const [activeList, setActiveList] = useState<string>("__all__");
  const [focusIdx, setFocusIdx] = useState(0);
  const [, navigate] = useLocation();
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
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
        playSound("click");
        toast({ title: "Retiré de la liste de suivi" });
      },
    },
  });
  const move = useUpdateWatchlistItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: "Actif déplacé" });
      },
    },
  });

  const quoteMap = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  const lists = useMemo(() => {
    const s = new Set<string>();
    watchlist.forEach((w: WatchlistItem) => s.add(w.listName || DEFAULT_LIST));
    if (s.size === 0) s.add(DEFAULT_LIST);
    return Array.from(s).sort((a, b) => (a === DEFAULT_LIST ? -1 : b === DEFAULT_LIST ? 1 : a.localeCompare(b)));
  }, [watchlist]);

  const filtered = useMemo(
    () => (activeList === "__all__" ? watchlist : watchlist.filter((w: WatchlistItem) => (w.listName || DEFAULT_LIST) === activeList)),
    [watchlist, activeList]
  );

  useEffect(() => {
    setFocusIdx(0);
  }, [activeList, filtered.length]);

  const onKeyNav = useCallback(
    (e: React.KeyboardEvent) => {
      if (filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => {
          const next = Math.min(i + 1, filtered.length - 1);
          rowRefs.current[next]?.focus();
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => {
          const next = Math.max(i - 1, 0);
          rowRefs.current[next]?.focus();
          return next;
        });
      } else if (e.key === "Enter") {
        const item = filtered[focusIdx];
        if (item) navigate(`/quote/${encodeURIComponent(item.symbol)}`);
      }
    },
    [filtered, focusIdx, navigate]
  );

  return (
    <div className="p-6 max-w-3xl">
      {showAdd && <AddSymbolModal existingLists={lists} onClose={() => setShowAdd(false)} />}
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

      {watchlist.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setActiveList("__all__")}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              activeList === "__all__" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            Toutes ({watchlist.length})
          </button>
          {lists.map((l) => {
            const count = watchlist.filter((w: WatchlistItem) => (w.listName || DEFAULT_LIST) === l).length;
            return (
              <button
                key={l}
                onClick={() => setActiveList(l)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  activeList === l ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {l} ({count})
              </button>
            );
          })}
        </div>
      )}

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
          {filtered.map((item: WatchlistItem, idx: number) => {
            const q = quoteMap[item.symbol];
            const cls = q ? changeClass(q.changePercent) : "";
            const up = q ? isUp(q.changePercent) : false;
            return (
              <div
                key={item.id}
                ref={(el) => { rowRefs.current[idx] = el; }}
                tabIndex={0}
                onKeyDown={onKeyNav}
                onFocus={() => setFocusIdx(idx)}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 focus:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary/40 transition-colors group"
              >
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
                {activeList === "__all__" && (
                  <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted-foreground/50 shrink-0">
                    {item.listName || DEFAULT_LIST}
                  </span>
                )}
                <MoveListMenu
                  item={item}
                  lists={lists}
                  onMove={(l) => move.mutate({ id: item.id, data: { listName: l } })}
                  onCreateNew={(l) => move.mutate({ id: item.id, data: { listName: l } })}
                />
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
      {filtered.length > 0 && (
        <p className="text-[11px] text-muted-foreground/50 mt-3">
          Astuce : cliquez une ligne puis utilisez ↑ ↓ pour naviguer et Entrée pour ouvrir.
        </p>
      )}
    </div>
  );
}
