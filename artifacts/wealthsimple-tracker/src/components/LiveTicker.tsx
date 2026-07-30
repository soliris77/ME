import { useGetQuotes } from "@workspace/api-client-react";
import { useRef, useState, useEffect } from "react";
import { Link } from "wouter";
import { formatPrice, formatPercent, isUp } from "@/lib/format";

const TICKER_SYMBOLS = [
  "^GSPC", "^IXIC", "^DJI", "^RUT",
  "^FTSE", "^GDAXI", "^FCHI",
  "^N225", "^HSI",
  "BTC-USD", "ETH-USD", "SOL-USD",
  "GC=F", "CL=F",
];

const DISPLAY_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones", "^RUT": "Russell 2000",
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
      <div className="h-8 bg-sidebar border-b border-sidebar-border flex items-center px-6">
        <div className="flex gap-8 animate-pulse">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-2.5 bg-sidebar-accent rounded w-20" />
          ))}
        </div>
      </div>
    );
  }

  const items = [...quotes, ...quotes];

  return (
    <div
      className={`h-8 bg-sidebar border-b border-sidebar-border overflow-hidden flex items-center select-none transition-colors duration-300 ${
        flash ? "bg-sidebar-accent/60" : ""
      }`}
    >
      <div className="ticker-track flex items-center whitespace-nowrap" ref={tickerRef}>
        {items.map((q, i) => {
          const up = isUp(q.changePercent);
          const name = DISPLAY_NAMES[q.symbol] ?? q.symbol;
          return (
            <Link
              key={`${q.symbol}-${i}`}
              href={`/quote/${encodeURIComponent(q.symbol)}`}
              className="inline-flex items-center gap-2 px-5 text-[11px] tracking-wide cursor-pointer hover:bg-sidebar-accent/40 transition-colors duration-150"
              style={{ borderRight: "1px solid hsl(var(--sidebar-border) / 0.4)" }}
            >
              <span className="font-semibold text-sidebar-foreground/70 uppercase tracking-widest text-[10px]">{name}</span>
              <span className="font-mono text-sidebar-foreground/90">{formatPrice(q.price, q.currency)}</span>
              <span
                className="font-mono font-semibold text-[10px]"
                style={{
                  color: up === null
                    ? "hsl(var(--muted-foreground))"
                    : up
                    ? "hsl(142 68% 52%)"
                    : "hsl(0 72% 62%)",
                }}
              >
                {up !== null && (up ? "▲" : "▼")}{" "}
                {formatPercent(q.changePercent)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
