import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import ConditionsUtilisation from "@/pages/ConditionsUtilisation";
import Dashboard from "@/pages/Dashboard";
import Watchlist from "@/pages/Watchlist";
import Alerts from "@/pages/Alerts";
import QuoteDetail from "@/pages/QuoteDetail";
import SearchPage from "@/pages/Search";
import MarketNewsJournal from "@/pages/MarketNewsJournal";
import Learn from "@/pages/Learn";
import CandleDetail from "@/pages/learn/CandleDetail";
import StrategyDetail from "@/pages/learn/StrategyDetail";
import GlossaryDetail from "@/pages/learn/GlossaryDetail";
import ApiStatusModal from "@/components/ApiStatusModal";
import GoldParticles from "@/components/GoldParticles";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { Bell, Bookmark, LayoutDashboard, Moon, Sun, Search, BookOpen, Settings, Newspaper } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 8_000 },
  },
});

function SolirisMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="goldGrad" cx="40%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#f0d98a" />
          <stop offset="45%" stopColor="#c9a040" />
          <stop offset="100%" stopColor="#8a6314" />
        </radialGradient>
        <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c9a040" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#c9a040" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Outer glow circle */}
      <circle cx="18" cy="18" r="18" fill="url(#goldGlow)" />
      {/* Main circle */}
      <circle cx="18" cy="18" r="16" fill="url(#goldGrad)" />
      {/* Inner ring */}
      <circle cx="18" cy="18" r="13.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.75" />
      {/* Top shine */}
      <ellipse cx="14" cy="12" rx="5" ry="3" fill="rgba(255,255,255,0.22)" transform="rotate(-20 14 12)" />
      {/* Letter S */}
      <text
        x="18"
        y="23.5"
        textAnchor="middle"
        fontFamily="'Cinzel', 'Times New Roman', serif"
        fontSize="16"
        fontWeight="700"
        fill="rgba(20,12,0,0.85)"
        letterSpacing="-0.5"
      >S</text>
    </svg>
  );
}

function Nav() {
  const [location] = useLocation();
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return true; // default to dark (Obsidian Luxe)
  });
  const [showApi, setShowApi] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const links = [
    { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { href: "/search", label: "Rechercher", icon: Search },
    { href: "/watchlist", label: "Portefeuille suivi", icon: Bookmark },
    { href: "/alerts", label: "Alertes prix", icon: Bell },
    { href: "/journal", label: "Journal des marchés", icon: Newspaper },
    { href: "/apprendre", label: "Apprendre à trader", icon: BookOpen },
  ];

  return (
    <>
      {showApi && <ApiStatusModal onClose={() => setShowApi(false)} />}
      <aside className="fixed inset-y-0 left-0 w-56 bg-sidebar border-r border-sidebar-border flex flex-col z-30">
        {/* Logo */}
        <div className="px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="logo-glow rounded-full flex-shrink-0">
              <SolirisMark />
            </div>
            <div className="leading-none">
              <div className="brand-mark text-sidebar-primary font-semibold text-[13px] tracking-[0.2em]">SOLIRIS</div>
              <div className="text-sidebar-foreground/40 text-[8.5px] tracking-[0.38em] mt-0.5">MARKET</div>
            </div>
          </div>
        </div>

        <div className="gold-divider" />

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-300 ease-out ${
                  active ? "nav-link-active" : "nav-link-inactive"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${active ? "text-sidebar-primary" : ""}`} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="gold-divider" />

        {/* Footer */}
        <div className="px-3 py-4 space-y-0.5">
          <button
            onClick={() => setShowApi(true)}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg w-full transition-all"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            Coûts API &amp; données
          </button>
          <button
            onClick={() => setDark((d) => !d)}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg w-full transition-all"
          >
            {dark ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
            {dark ? "Mode clair" : "Mode sombre"}
          </button>
          <Link
            href="/conditions-utilisation"
            className="link-underline flex items-center gap-2 px-3 py-2 text-[11px] text-sidebar-foreground/35 hover:text-sidebar-accent-foreground transition-colors w-fit"
          >
            Conditions d'utilisation
          </Link>
        </div>
      </aside>
    </>
  );
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen relative">
      <GoldParticles />
      <Nav />
      <main className="flex-1 ml-56 min-h-screen bg-background relative z-10">
        {children}
      </main>
    </div>
  );
}

function wrap(name: string, Page: React.ComponentType) {
  return () => (
    <AppLayout>
      <PageErrorBoundary pageName={name}>
        <Page />
      </PageErrorBoundary>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/conditions-utilisation" component={ConditionsUtilisation} />
            <Route path="/dashboard" component={wrap("Tableau de bord", Dashboard)} />
            <Route path="/search" component={wrap("Recherche", SearchPage)} />
            <Route path="/watchlist" component={wrap("Portefeuille suivi", Watchlist)} />
            <Route path="/alerts" component={wrap("Alertes prix", Alerts)} />
            <Route path="/journal" component={wrap("Journal des marchés", MarketNewsJournal)} />
            <Route path="/apprendre/chandeliers/:slug" component={wrap("Chandeliers", CandleDetail)} />
            <Route path="/apprendre/strategies/:slug" component={wrap("Stratégies", StrategyDetail)} />
            <Route path="/apprendre/glossaire/:slug" component={wrap("Glossaire", GlossaryDetail)} />
            <Route path="/apprendre/:tab" component={wrap("Apprendre", Learn)} />
            <Route path="/apprendre" component={wrap("Apprendre", Learn)} />
            <Route path="/quote/:symbol" component={wrap("Fiche du titre", QuoteDetail)} />
            <Route component={wrap("Page introuvable", NotFound)} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
