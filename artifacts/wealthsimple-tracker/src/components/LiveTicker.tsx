import { useGetQuotes } from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { formatPrice, formatPercent, isUp } from "@/lib/format";

const TICKER_SYMBOLS = [
  "^GSPC", "^IXIC", "^DJI", "^GSPTSX",
  "^FTSE", "^GDAXI", "^FCHI",
  "^N225", "^HSI",
  "BTC-USD", "ETH-USD", "SOL-USD",
  "GC=F", "CL=F",
];

const DISPLAY_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones", "^GSPTSX": "TSX",
  "^FTSE": "FTSE 100", "^GDAXI": "DAX", "^FCHI": "CAC 40",
  "^N225": "Nikkei", "^HSI": "Hang Seng",
  "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
  "GC=F": "Or", "CL=F": "Pétrole",
};

export default function LiveTicker() {
  const { data: quotes = [] } = useGetQuotes(
    { symbols: TICKER_SYMBOLS.join(",") },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { refetchInterval: 10_000 } as any }
  );

  const tickerRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (quotes.length === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [quotes]);

  if (quotes.length === 0) {
    return (
      <div className="h-9 bg-card border-b border-border flex items-center px-4">
        <div className="flex gap-6 animate-pulse">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-3 bg-muted rounded w-24" />
          ))}
        </div>
      </div>
    );
  }

  const items = [...quotes, ...quotes]; // duplicate for seamless loop

  return (
    <div
      className={`h-9 bg-card border-b border-border overflow-hidden flex items-center select-none transition-colors ${flash ? "bg-primary/5" : ""}`}
    >
      <div className="ticker-track flex items-center gap-0 whitespace-nowrap" ref={tickerRef}>
        {items.map((q, i) => {
          const up = isUp(q.changePercent);
          const name = DISPLAY_NAMES[q.symbol] ?? q.symbol;
          return (
            <span key={`${q.symbol}-${i}`} className="inline-flex items-center gap-1.5 px-4 border-r border-border/40 text-xs">
              <span className="font-semibold text-foreground">{name}</span>
              <span className="font-mono text-foreground">{formatPrice(q.price, q.currency)}</span>
              <span className={`font-mono font-semibold ${up === null ? "text-muted-foreground" : up ? "text-emerald-500" : "text-red-500"}`}>
                {up !== null && (up ? "▲" : "▼")}{up !== null && " "}{formatPercent(q.changePercent)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
