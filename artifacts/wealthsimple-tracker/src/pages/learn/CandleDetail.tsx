import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { CANDLES } from "@/data/learnContent";
import { usePageMeta } from "@/hooks/use-page-meta";
import NotFound from "@/pages/not-found";

export default function CandleDetail() {
  const params = useParams<{ slug: string }>();
  const candle = CANDLES.find((c) => c.slug === params?.slug);

  usePageMeta(
    candle ? `${candle.name} : pattern chandelier ${candle.signal} expliqué | Soliris Market` : "Pattern introuvable | Soliris Market",
    candle ? candle.description : "Ce pattern de chandelier n'existe pas.",
  );

  if (!candle) return <NotFound />;

  const others = CANDLES.filter((c) => c.slug !== candle.slug).slice(0, 4);

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/apprendre/chandeliers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux chandeliers japonais
      </Link>

      <div className={`border rounded-2xl p-6 ${
        candle.signal === "haussier" ? "border-emerald-500/20 bg-emerald-500/5" :
        candle.signal === "baissier" ? "border-red-500/20 bg-red-500/5" :
        "border-border bg-muted/20"
      }`}>
        <div className="flex items-start gap-4">
          <div className="w-16 h-20 shrink-0 flex items-center justify-center bg-background/60 rounded-xl" dangerouslySetInnerHTML={{ __html: candle.svg }} />
          <div>
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
              candle.signal === "haussier" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
              candle.signal === "baissier" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
              "bg-muted text-muted-foreground"
            }`}>{candle.signal === "haussier" ? "🟢 Signal haussier" : candle.signal === "baissier" ? "🔴 Signal baissier" : "⚪ Neutre"}</span>
            <h1 className="text-xl font-bold mt-2">{candle.name}</h1>
          </div>
        </div>

        <p className="text-sm text-foreground/80 leading-relaxed mt-4">{candle.description}</p>

        <div className="bg-background/60 rounded-xl p-4 mt-4">
          <p className="text-sm font-semibold text-primary mb-1">💡 Comment l'utiliser en trading</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{candle.howToUse}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Autres patterns à connaître</h2>
        <div className="grid grid-cols-2 gap-2">
          {others.map((c) => (
            <Link
              key={c.slug}
              href={`/apprendre/chandeliers/${c.slug}`}
              className="text-sm px-3 py-2 border border-border rounded-lg hover:border-primary/40 hover:bg-muted/30 transition-colors"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
