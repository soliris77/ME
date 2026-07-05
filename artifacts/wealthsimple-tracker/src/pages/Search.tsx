import { useState, useEffect, useRef } from "react";
import { useSearchSymbols, useGetQuotes } from "@workspace/api-client-react";
import { formatPrice, formatPercent, changeClass } from "@/lib/format";
import { Link } from "wouter";
import { Search, ArrowUpRight, ArrowDownRight, TrendingUp, Globe, Bitcoin, BarChart2, Layers } from "lucide-react";

const TYPE_LABELS: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  stock: { label: "Action", icon: TrendingUp, color: "text-blue-500" },
  etf: { label: "FNB/ETF", icon: Layers, color: "text-violet-500" },
  crypto: { label: "Crypto", icon: Bitcoin, color: "text-orange-500" },
  index: { label: "Indice", icon: BarChart2, color: "text-emerald-500" },
};

const SUGGESTED = [
  { symbol: "XEQT.TO", name: "iShares Core Equity ETF", type: "etf" },
  { symbol: "VEQT.TO", name: "Vanguard All-Equity ETF", type: "etf" },
  { symbol: "AAPL", name: "Apple Inc.", type: "stock" },
  { symbol: "NVDA", name: "NVIDIA Corporation", type: "stock" },
  { symbol: "SHOP.TO", name: "Shopify Inc.", type: "stock" },
  { symbol: "BTC-USD", name: "Bitcoin USD", type: "crypto" },
  { symbol: "^GSPC", name: "S&P 500", type: "index" },
  { symbol: "^GDAXI", name: "DAX (Allemagne)", type: "index" },
  { symbol: "GC=F", name: "Or (Futures)", type: "stock" },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isLoading } = useSearchSymbols(
    { params: { q: debouncedQuery } },
    { query: { enabled: debouncedQuery.length >= 1 } }
  );

  const suggestedSymbols = SUGGESTED.map((s) => s.symbol).join(",");
  const { data: suggestedQuotes = [] } = useGetQuotes(
    { params: { symbols: suggestedSymbols } },
    { query: { enabled: !debouncedQuery } }
  );

  const quoteMap = Object.fromEntries(suggestedQuotes.map((q) => [q.symbol, q]));

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1">Rechercher un actif</h1>
        <p className="text-sm text-muted-foreground">Actions, FNB, crypto, indices — marchés mondiaux accessibles</p>
      </div>

      {/* Search input */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          className="w-full pl-9 pr-4 py-3 text-sm bg-card border border-card-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          placeholder="Entrez un symbole ou un nom (ex: AAPL, Tesla, Bitcoin...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isLoading && debouncedQuery && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Search results */}
      {debouncedQuery && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden mb-6">
          {isLoading ? (
            <div className="divide-y divide-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
                  <div className="w-8 h-8 bg-muted rounded-lg" />
                  <div className="flex-1">
                    <div className="h-3.5 bg-muted rounded w-20 mb-1.5" />
                    <div className="h-3 bg-muted rounded w-36" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun résultat pour « {debouncedQuery} »
            </div>
          ) : (
            <div className="divide-y divide-border">
              {results.map((r) => {
                const meta = TYPE_LABELS[r.type] ?? TYPE_LABELS.stock;
                const Icon = meta.icon;
                return (
                  <Link key={r.symbol} href={`/quote/${r.symbol}`}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors group">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-mono group-hover:text-primary transition-colors">{r.symbol}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded bg-muted font-medium ${meta.color}`}>{meta.label}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{r.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">{r.exchange}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Suggested / default */}
      {!debouncedQuery && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Actifs populaires</span>
          </div>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden divide-y divide-border">
            {SUGGESTED.map((s) => {
              const q = quoteMap[s.symbol];
              const meta = TYPE_LABELS[s.type] ?? TYPE_LABELS.stock;
              const Icon = meta.icon;
              const cls = q ? changeClass(q.changePercent) : "";
              return (
                <Link key={s.symbol} href={`/quote/${s.symbol}`}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors group">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-mono group-hover:text-primary transition-colors">{s.symbol}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded bg-muted font-medium ${meta.color}`}>{meta.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{s.name}</div>
                    </div>
                    {q ? (
                      <div className="text-right shrink-0">
                        <div className="text-sm font-mono font-semibold">{formatPrice(q.price, q.currency)}</div>
                        <div className={`text-xs font-mono flex items-center justify-end gap-0.5 ${cls}`}>
                          {q.changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {formatPercent(q.changePercent)}
                        </div>
                      </div>
                    ) : (
                      <div className="w-16 h-8 bg-muted rounded animate-pulse" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-card border border-card-border rounded-xl">
            <p className="text-xs font-semibold text-foreground mb-1.5">💡 Marchés disponibles</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>🇺🇸 Actions américaines (NASDAQ, NYSE)</span>
              <span>🇨🇦 Actions canadiennes (TSX)</span>
              <span>🇬🇧 Bourse de Londres (LSE)</span>
              <span>🇩🇪 Bourse de Francfort (DAX)</span>
              <span>🇫🇷 Bourse de Paris (CAC 40)</span>
              <span>🇯🇵 Bourse de Tokyo (Nikkei)</span>
              <span>🪙 Cryptomonnaies (BTC, ETH, SOL...)</span>
              <span>🥇 Matières premières (Or, Pétrole...)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
