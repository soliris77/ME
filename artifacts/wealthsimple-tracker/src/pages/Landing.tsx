import { Link } from "wouter";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function Landing() {
  usePageMeta(
    "Soliris Market",
    "Soliris Market — un suivi des marchés épuré et sans bruit, pensé pour l'investisseur exigeant."
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#07080a] text-[#f2ead6]">
      {/* fond : vignette dorée très douce, pas d'image importée */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 32%, rgba(201,162,39,0.14), transparent 65%), radial-gradient(ellipse 120% 80% at 50% 100%, rgba(201,162,39,0.05), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)",
        }}
      />

      {/* en-tête minimal */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2.5">
          <img
            src="/lion-emblem.png"
            alt="Soliris Market"
            className="h-8 w-8 rounded-full object-cover bg-black"
          />
          <span className="brand-mark text-[13px] tracking-[0.28em] text-[#c9a227]">SOLIRIS</span>
        </div>
        <Link href="/dashboard">
          <button className="text-xs tracking-[0.2em] text-[#f2ead6]/70 hover:text-[#c9a227] transition-colors uppercase">
            Entrer
          </button>
        </Link>
      </header>

      {/* corps : emblème + signature de marque */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-[6vh] pb-[10vh] sm:pt-[8vh] text-center">
        <div className="animate-[fadeUp_1.1s_ease-out]">
          <img
            src="/lion-emblem.png"
            alt=""
            aria-hidden="true"
            className="mx-auto h-40 w-40 sm:h-52 sm:w-52 rounded-full object-cover ring-1 ring-[#c9a227]/40 shadow-[0_0_60px_rgba(201,162,39,0.15)]"
          />
        </div>

        <h1
          className="brand-mark mt-10 text-[15vw] leading-none text-[#f2ead6] sm:text-[64px] animate-[fadeUp_1.1s_ease-out_0.15s_both]"
          style={{ letterSpacing: "0.16em" }}
        >
          SOLIRIS
        </h1>
        <div className="mt-3 text-[11px] tracking-[0.5em] text-[#c9a227] animate-[fadeUp_1.1s_ease-out_0.25s_both]">
          MARKET
        </div>

        <div className="gold-divider mt-8 w-24 animate-[fadeUp_1.1s_ease-out_0.35s_both]" />

        <p
          className="brand-serif mt-8 max-w-md text-xl italic text-[#f2ead6]/80 sm:text-2xl animate-[fadeUp_1.1s_ease-out_0.45s_both]"
        >
          Une lecture claire des marchés, pour ceux qui n'ont pas de temps à perdre.
        </p>

        <Link href="/dashboard">
          <button className="mt-12 border border-[#c9a227]/60 px-10 py-3 text-xs tracking-[0.3em] text-[#c9a227] uppercase transition-colors hover:bg-[#c9a227] hover:text-[#07080a] animate-[fadeUp_1.1s_ease-out_0.55s_both]">
            Accéder aux marchés
          </button>
        </Link>
      </main>

      <footer className="relative z-10 flex items-center justify-center pb-8">
        <span className="text-[10px] tracking-[0.2em] text-[#f2ead6]/35">
          SOLIRIS MARKET — DONNÉES DE MARCHÉ EN TEMPS DIFFÉRÉ
        </span>
      </footer>
    </div>
  );
}
