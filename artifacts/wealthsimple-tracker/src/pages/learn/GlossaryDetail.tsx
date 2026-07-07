import { Link, useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { GLOSSAIRE } from "@/data/learnContent";
import { usePageMeta } from "@/hooks/use-page-meta";
import NotFound from "@/pages/not-found";

export default function GlossaryDetail() {
  const [, params] = useRoute<{ slug: string }>("/apprendre/glossaire/:slug");
  const term = GLOSSAIRE.find((g) => g.slug === params?.slug);

  usePageMeta(
    term ? `${term.term} : définition | Glossaire trading Soliris Market` : "Terme introuvable | Soliris Market",
    term ? term.definition : "Ce terme n'existe pas dans le glossaire.",
  );

  if (!term) return <NotFound />;

  const related = GLOSSAIRE.filter((g) => g.category === term.category && g.slug !== term.slug).slice(0, 5);

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/apprendre/glossaire" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour au glossaire
      </Link>

      <div className="border border-card-border bg-card rounded-2xl p-6">
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">{term.category}</span>
        <h1 className="text-xl font-bold mt-2 mb-3">{term.term}</h1>
        <p className="text-sm text-foreground/80 leading-relaxed">{term.definition}</p>
      </div>

      {related.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Termes liés — {term.category}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {related.map((g) => (
              <Link
                key={g.slug}
                href={`/apprendre/glossaire/${g.slug}`}
                className="text-sm px-3 py-2 border border-border rounded-lg hover:border-primary/40 hover:bg-muted/30 transition-colors"
              >
                {g.term}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
