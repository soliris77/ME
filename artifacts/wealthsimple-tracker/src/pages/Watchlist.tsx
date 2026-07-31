import {
  useGetWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useUpdateWatchlistItem,
  useGetQuotes,
  useGetQuoteHistory,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { playSound } from "@/lib/sounds";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { formatPrice, formatPercent, changeClass, isUp } from "@/lib/format";
import { Link, useLocation } from "wouter";
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Bookmark, X, FolderInput, ListPlus, CheckCircle2, XCircle, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { WatchlistItem } from "@workspace/api-client-react";
import { isTradeableSymbol, nonTradeableReason } from "@/lib/tradeability";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Sparkline SVG inline ─────────────────────────────────────────────────────

function WatchlistSparkline({ symbol }: { symbol: string }) {
  const { data: history = [] } = useGetQuoteHistory(
    symbol, "5d",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 } as any }
  );

  const prices = (history as { close: number }[]).map((h) => h.close).filter((v) => typeof v === "number" && !isNaN(v));
  if (prices.length < 2) return <div className="w-14 h-5 shrink-0" />;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const W = 56, H = 20;

  const pts = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * W,
    y: H - 2 - ((p - min) / range) * (H - 4),
  }));

  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const rising = prices[prices.length - 1] >= prices[0];

  return (
    <svg width={W} height={H} className="overflow-visible shrink-0 opacity-80">
      <path d={d} fill="none"
        stroke={rising ? "#22c55e" : "#ef4444"}
        strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

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
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden divide-y divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-4 flex items-center gap-4">
              <div className="flex-1">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="w-14 h-5 hidden sm:block" />
              <div className="text-right">
                <Skeleton className="h-4 w-20 mb-1 ml-auto" />
                <Skeleton className="h-3 w-14 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : watchlist.length === 0 ? (
        <div className="bg-card border border-card-border rounded-2xl p-14 text-center">
          {/* Illustration SVG */}
          <div className="w-20 h-20 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center mx-auto mb-5">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-primary/50">
              <path d="M8 32L8 14L20 6L32 14L32 32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 32V22H25V32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 14L20 10L26 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="20" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </div>
          <p className="font-bold text-lg text-foreground mb-1.5">Portefeuille suivi vide</p>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto leading-relaxed">
            Ajoutez des actions, FNB ou cryptomonnaies pour suivre leurs prix en temps réel et recevoir des alertes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Ajouter un actif
            </button>
            <Link href="/search">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer">
                <Search className="w-4 h-4" />
                Rechercher un titre
              </span>
            </Link>
          </div>
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
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-bold font-mono text-foreground">{item.symbol}</div>
                      {/* Badge disponibilité Wealthsimple */}
                      {isTradeableSymbol(item.symbol) ? (
                        <span title="Disponible sur Wealthsimple"
                          className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)" }}>
                          <CheckCircle2 className="w-2.5 h-2.5" /> WS
                        </span>
                      ) : (
                        <span title={nonTradeableReason(item.symbol)}
                          className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 cursor-help"
                          style={{ background: "rgba(139,146,165,0.10)", color: "hsl(var(--muted-foreground))", border: "1px solid rgba(139,146,165,0.22)" }}>
                          <XCircle className="w-2.5 h-2.5" /> Non WS
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-52">{item.name}</div>
                    {item.note && <div className="text-xs text-muted-foreground/70 mt-0.5 italic truncate max-w-52">{item.note}</div>}
                  </div>
                  {q ? (
                    <div className="flex items-center gap-3 ml-4">
                      {/* Sparkline 5d — masquée sur mobile */}
                      <div className="hidden sm:block">
                        <WatchlistSparkline symbol={item.symbol} />
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-semibold">{formatPrice(q.price, q.currency)}</div>
                        <div className={`text-xs font-mono ${cls} flex items-center justify-end gap-0.5`}>
                          {up === true && <ArrowUpRight className="w-3 h-3" />}
                          {up === false && <ArrowDownRight className="w-3 h-3" />}
                          {formatPercent(q.changePercent)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right ml-4 space-y-1">
                      <Skeleton className="h-4 w-20 ml-auto" />
                      <Skeleton className="h-3 w-14 ml-auto" />
                    </div>
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
