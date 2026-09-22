import { useGetQuoteHistory } from "@workspace/api-client-react";

/**
 * Mini-graphique 5 jours partagé (dashboard, listes).
 * Récupère l'historique 5d (cache 5 min) et trace une polyline SVG.
 * Vert si la période est en hausse, rouge sinon ; espace réservé si pas de données.
 */
export function Sparkline({ symbol, width = 56, height = 20 }: { symbol: string; width?: number; height?: number }) {
  const { data: history = [] } = useGetQuoteHistory(
    symbol, "5d",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 } as any }
  );

  const prices = (history as { close: number }[])
    .map((h) => h.close)
    .filter((v) => typeof v === "number" && !isNaN(v));

  if (prices.length < 2) {
    return <div style={{ width, height }} className="shrink-0" aria-hidden="true" />;
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pts = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * width,
    y: height - 2 - ((p - min) / range) * (height - 4),
  }));

  const d = pts.reduce((path, point, index) => {
    if (index === 0) return `M${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    const previous = pts[index - 1];
    const midpointX = ((previous.x + point.x) / 2).toFixed(1);
    return `${path} Q${midpointX},${previous.y.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }, "");
  const rising = prices[prices.length - 1] >= prices[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible shrink-0 opacity-80"
      role="img"
      aria-label={`Évolution récente de ${symbol}, ${rising ? "en hausse" : "en baisse"}`}
    >
      <path
        d={d}
        fill="none"
        stroke={rising ? "#22c55e" : "#ef4444"}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
