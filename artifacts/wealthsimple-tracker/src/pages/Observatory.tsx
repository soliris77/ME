import { lazy, Suspense } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Compass,
  Globe2,
  Info,
  Layers3,
  Radio,
  Sparkles,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

const MarketGlobe = lazy(() => import("@/components/MarketGlobe"));

const OBSERVATORY_READINGS = [
  {
    icon: Radio,
    label: "Relais actif",
    title: "Suivre la main qui passe",
    text: "Chaque place prend le relais d’une autre. Le globe montre la séance, pas une prédiction.",
  },
  {
    icon: Layers3,
    label: "Lecture en couches",
    title: "Temps, territoire, contexte",
    text: "Survolez un nœud pour voir son heure locale, son statut et sa place dans le cycle mondial.",
  },
  {
    icon: Compass,
    label: "Navigation",
    title: "Choisir un point de vue",
    text: "Faites glisser la Terre, sélectionnez un marché et observez les ondulations du relais actif.",
  },
];

export default function Observatory() {
  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <header className="flex flex-col gap-5 border-b border-border/40 pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                <Globe2 className="h-3.5 w-3.5" />
                Soliris · Observatoire
              </div>
              <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
                Le monde change de main.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Une salle de lecture dédiée aux fuseaux, aux séances et aux places qui
                donnent le rythme. Ici, le marché devient une géographie vivante.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 self-start rounded-full border border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary lg:self-auto"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour au tableau
            </Link>
          </header>

          <section className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["08", "places suivies"],
              ["03", "grands relais"],
              ["24 h", "cycle mondial"],
              ["live", "état de séance"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="surface-glass rounded-xl border border-border/50 px-4 py-3"
              >
                <div className="font-mono text-lg text-primary">{value}</div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  {label}
                </div>
              </div>
            ))}
          </section>

          <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
            <div className="observatory-room relative min-h-[560px] overflow-hidden rounded-2xl border border-primary/20 bg-[#070b11] shadow-2xl">
              <div className="observatory-room-stars pointer-events-none absolute inset-0" />
              <div className="pointer-events-none absolute left-6 top-5 z-10">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Salle des fuseaux
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Survolez la Terre pour ouvrir les instruments.
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 top-12">
                <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Chargement de l’observatoire…</div>}>
                  <MarketGlobe variant="hero" />
                </Suspense>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-primary/25 bg-card/70 p-5 shadow-xl">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  <Info className="h-3.5 w-3.5" />
                  Comment lire l’astre
                </div>
                <h2 className="mt-3 font-serif text-2xl text-foreground">
                  Une encyclopédie en mouvement
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Le globe n’affiche pas de faux cours. Il révèle les heures locales,
                  les marchés ouverts et le contexte économique de chaque nœud.
                </p>
              </div>

              {OBSERVATORY_READINGS.map(({ icon: Icon, label, title, text }) => (
                <div
                  key={label}
                  className="surface-glass rounded-2xl border border-border/50 p-4 transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p>
                </div>
              ))}
            </aside>
          </section>
        </div>
      </div>
    </PageTransition>
  );
}