import { Link, useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { STRATEGIES } from "@/data/learnContent";
import { usePageMeta } from "@/hooks/use-page-meta";
import NotFound from "@/pages/not-found";

export default function StrategyDetail() {
  const [, params] = useRoute<{ slug: string }>("/apprendre/strategies/:slug");
  const strategy = STRATEGIES.find((s) => s.slug === params?.slug);

  usePageMeta(
    strategy ? `${strategy.name} : stratégie de trading ${strategy.level.toLowerCase()} | Soliris Market` : "Stratégie introuvable | Soliris Market",
    strategy ? strategy.description : "Cette stratégie n'existe pas.",
  );

  if (!strategy) return <NotFound />;

  const others = STRATEGIES.filter((s) => s.slug !== strategy.slug);

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/apprendre/strategies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux stratégies
      </Link>

      <div className={`border rounded-2xl p-6 ${strategy.bg} border-current/20`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className={`font-bold text-xl ${strategy.color}`}>{strategy.name}</h1>
          <span className="text-xs bg-background/60 px-2 py-1 rounded-full font-medium shrink-0">{strategy.level}</span>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">{strategy.description}</p>

        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Étapes concrètes</p>
          <div className="space-y-2">
            {strategy.steps.map((step, i) => (
              <div key={i} className="flex gap-2.5 text-sm bg-background/40 rounded-lg p-2.5">
                <span className={`${strategy.color} font-bold shrink-0`}>{i + 1}.</span>
                <span className="text-foreground/80 leading-relaxed">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-emerald-500/10 rounded-lg p-3">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">✅ Avantages</span>
            <p className="text-foreground/70 mt-1">{strategy.pros}</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3">
            <span className="font-semibold text-red-600 dark:text-red-400">⚠️ Limites</span>
            <p className="text-foreground/70 mt-1">{strategy.cons}</p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Autres stratégies</h2>
        <div className="grid grid-cols-1 gap-2">
          {others.map((s) => (
            <Link
              key={s.slug}
              href={`/apprendre/strategies/${s.slug}`}
              className="text-sm px-3 py-2 border border-border rounded-lg hover:border-primary/40 hover:bg-muted/30 transition-colors"
            >
              {s.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
