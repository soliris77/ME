import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Compass,
  Info,
  Layers3,
  MousePointer2,
  Radio,
  Sparkles,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import ObservatoryHero from "@/components/ObservatoryHero";

const OBSERVATORY_READINGS = [
  {
    icon: Radio,
    label: "Relais actif",
    title: "Suivre la main qui passe",
    text: "Chaque place prend le relais d’une autre. Les ondulations signalent la séance ouverte, sans transformer le statut en prédiction.",
  },
  {
    icon: Layers3,
    label: "Lecture en couches",
    title: "Temps, territoire, contexte",
    text: "Survolez un nœud pour voir son heure locale, son statut et son rôle dans le cycle mondial.",
  },
  {
    icon: Compass,
    label: "Navigation",
    title: "Choisir un point de vue",
    text: "Faites glisser la Terre, sélectionnez une place et utilisez les commandes de rotation pour composer votre lecture.",
  },
];

export default function Observatory() {
  const [isImmersive, setIsImmersive] = useState(false);

  useEffect(() => {
    if (!isImmersive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsImmersive(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isImmersive]);

  return (
    <PageTransition>
      <div className={`observatory-page-shell min-h-screen bg-background ${isImmersive ? "observatory-page-shell-immersive" : ""}`}>
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-10 lg:py-7">
          <header className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">
              <Sparkles className="h-3.5 w-3.5" />
              Soliris · Salle d’observation
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Tableau de bord
            </Link>
          </header>

          <ObservatoryHero
            variant="page"
            isImmersive={isImmersive}
            onToggleImmersive={() => setIsImmersive((value) => !value)}
          />

          {!isImmersive && (
            <section className="observatory-context mt-6 grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
            <div className="observatory-context-panel rounded-2xl border border-primary/20 bg-card/60 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-primary">
                <Info className="h-3.5 w-3.5" />
                Guide de lecture
              </div>
              <h2 className="mt-3 font-serif text-2xl tracking-tight text-foreground">
                Une encyclopédie en mouvement
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                L’Observatoire distingue les faits de séance des données de prix.
                Il montre où le marché est ouvert, quelle heure il est sur place et
                comment les relais s’enchaînent.
              </p>
              <div className="mt-5 flex items-start gap-3 border-t border-border/50 pt-4">
                <MousePointer2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Sur ordinateur, survolez les instruments. Sur mobile, touchez un
                  nœud pour ouvrir sa fiche et utilisez le bouton de rotation pour
                  changer de perspective.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {OBSERVATORY_READINGS.map(({ icon: Icon, label, title, text }) => (
                <article
                  key={label}
                  className="observatory-context-card rounded-2xl border border-border/50 bg-card/35 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/60"
                >
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/85">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p>
                </article>
              ))}
            </div>
            </section>
          )}
        </div>
      </div>
    </PageTransition>
  );
}