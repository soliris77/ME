import { Link } from "wouter";
import { usePageMeta } from "@/hooks/use-page-meta";
import { LineChart, ShieldCheck, Bell, Compass } from "lucide-react";
import { Reveal, StaggerGroup, StaggerItem, Parallax } from "@/components/motion";
import { lazy, Suspense } from "react";

const MarketGlobe = lazy(() => import("@/components/MarketGlobe"));

const PILLARS = [
  {
    icon: LineChart,
    title: "Précision",
    text: "Des cours de marché lus au dixième près, présentés sans artifice ni distraction.",
  },
  {
    icon: Bell,
    title: "Vigilance",
    text: "Des alertes discrètes qui vous préviennent au moment juste — jamais avant, jamais trop tard.",
  },
  {
    icon: Compass,
    title: "Clarté",
    text: "Une seule vue, tous les marchés. L'essentiel, rien que l'essentiel.",
  },
  {
    icon: ShieldCheck,
    title: "Rigueur",
    text: "Des données vérifiées, une interface pensée pour durer, à l'image d'un instrument de précision.",
  },
];

export default function Landing() {
  usePageMeta(
    "Soliris Market",
    "Soliris Market — un suivi des marchés épuré et sans bruit, pensé pour l'investisseur exigeant."
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#07080a] text-[#f2ead6]">
      <div className="space-starfield pointer-events-none fixed inset-0" aria-hidden="true" />
      {/* fond : vignette dorée très douce, pas d'image importée */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 32%, rgba(201,162,39,0.14), transparent 65%), radial-gradient(ellipse 120% 80% at 50% 100%, rgba(201,162,39,0.05), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.018]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)",
        }}
      />

      {/* en-tête minimal */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2.5">
          <img
            src="/soliris-icon.svg"
            alt="Soliris Market"
            className="emblem-spin h-8 w-8 object-cover bg-black"
          />
          <span className="brand-mark text-[13px] tracking-[0.28em] text-[#c9a227]">SOLIRIS</span>
        </div>
        <Link href="/dashboard">
          <button className="link-underline text-xs tracking-[0.2em] text-[#f2ead6]/70 hover:text-[#c9a227] transition-colors uppercase">
            Entrer
          </button>
        </Link>
      </header>

      {/* corps : signature de marque + observatoire mondial */}
      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-88px)] w-full max-w-7xl items-center gap-6 px-6 pb-16 pt-8 text-center sm:px-10 lg:grid-cols-[0.85fr_1.15fr] lg:text-left">
        <div className="relative z-20 flex flex-col items-center lg:items-start">
          <Parallax speed={0.25} className="animate-[fadeUp_1.1s_ease-out]">
            <img
              src="/soliris-icon.svg"
              alt=""
              aria-hidden="true"
              className="emblem-spin h-28 w-28 object-contain drop-shadow-[0_0_40px_rgba(201,162,39,0.25)] sm:h-36 sm:w-36"
            />
          </Parallax>

          <h1
            className="brand-mark mt-8 text-[15vw] leading-none text-[#f2ead6] sm:text-[64px] animate-[fadeUp_1.1s_ease-out_0.15s_both]"
            style={{ letterSpacing: "0.16em" }}
          >
            SOLIRIS
          </h1>
          <div className="mt-3 text-[11px] tracking-[0.5em] text-[#c9a227] animate-[fadeUp_1.1s_ease-out_0.25s_both]">
            MARKET
          </div>

          <div className="gold-divider mt-8 w-24 animate-[fadeUp_1.1s_ease-out_0.35s_both]" />

          <p className="brand-serif mt-8 max-w-md text-xl italic text-[#f2ead6]/80 sm:text-2xl animate-[fadeUp_1.1s_ease-out_0.45s_both]">
            Une lecture claire des marchés, pour ceux qui n'ont pas de temps à perdre.
          </p>

          <div className="relative z-20 mt-10 flex flex-col items-center gap-5 sm:flex-row sm:gap-4 animate-[fadeUp_1.1s_ease-out_0.55s_both]">
            <Link href="/dashboard">
              <button className="btn-sheen border border-[#c9a227]/60 px-10 py-3 text-xs tracking-[0.3em] text-[#c9a227] uppercase hover:text-[#07080a] hover:bg-[#c9a227] hover:border-[#c9a227] hover:shadow-[0_0_36px_rgba(201,162,39,0.35)]">
                Accéder aux marchés
              </button>
            </Link>
            <Link href="/tarifs">
              <button className="link-underline px-2 py-3 text-xs tracking-[0.28em] uppercase text-[#f2ead6]/55 hover:text-[#c9a227] tr-control">
                Voir l'abonnement
              </button>
            </Link>
          </div>
        </div>

        <Reveal as="div" direction="scale" className="relative z-10 mx-auto aspect-square w-full max-w-[590px]">
          <div className="pointer-events-none absolute inset-[7%] rounded-full border border-[#c9a227]/10 shadow-[0_0_90px_rgba(201,162,39,0.09)]" />
          <div className="orbital-ring" />
          <div className="pointer-events-none absolute left-1/2 top-[6%] z-20 -translate-x-1/2 text-center">
            <div className="text-[9px] font-semibold uppercase tracking-[0.34em] text-[#c9a227]/80">
              Observatoire mondial
            </div>
            <div className="mt-1 text-[9px] tracking-[0.12em] text-[#f2ead6]/45">
              Faites glisser pour explorer
            </div>
          </div>
          <Suspense fallback={null}>
            <MarketGlobe variant="hero" />
          </Suspense>
        </Reveal>
      </main>

      {/* piliers de marque */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-[10vh] sm:px-10">
        <div className="section-rule justify-center text-[#c9a227]/70">
          <span className="shrink-0">L'ESPRIT SOLIRIS</span>
        </div>

        <StaggerGroup speed="wide" className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <StaggerItem
              key={title}
              className="lux-card rounded-lg border border-[#c9a227]/15 bg-white/[0.02] p-6 text-left"
            >
              <Icon className="h-5 w-5 text-[#c9a227]" strokeWidth={1.5} />
              <div className="brand-mark mt-4 text-[12px] tracking-[0.22em] text-[#f2ead6]">
                {title.toUpperCase()}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#f2ead6]/60">{text}</p>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </section>

      {/* citation de fermeture */}
      <Reveal as="section" direction="scale" className="relative z-10 mx-auto max-w-2xl px-6 pb-[12vh] text-center sm:px-10">
        <div className="gold-divider mx-auto w-24" />
        <p className="brand-serif mt-8 text-lg italic text-[#f2ead6]/70 sm:text-xl">
          « La précision n'est pas un détail. C'est la mesure de tout. »
        </p>
      </Reveal>

      <footer className="relative z-10 flex flex-col items-center justify-center gap-3 pb-10">
        <div className="flex items-center gap-6 text-[10px] tracking-[0.2em] text-[#f2ead6]/45">
          <Link href="/tarifs">
            <span className="link-underline cursor-pointer hover:text-[#c9a227] transition-colors">
              ABONNEMENT
            </span>
          </Link>
          <Link href="/conditions-utilisation">
            <span className="link-underline cursor-pointer hover:text-[#c9a227] transition-colors">
              CONDITIONS D'UTILISATION
            </span>
          </Link>
        </div>
        <span className="text-[10px] tracking-[0.2em] text-[#f2ead6]/35">
          SOLIRIS MARKET — DONNÉES DE MARCHÉ EN TEMPS DIFFÉRÉ
        </span>
      </footer>
    </div>
  );
}
