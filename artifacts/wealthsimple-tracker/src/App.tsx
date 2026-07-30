import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import ConditionsUtilisation from "@/pages/ConditionsUtilisation";
import BrokerPage from "@/pages/Broker";
import TradingModeBanner from "@/components/TradingModeBanner";
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
import SettingsPage from "@/pages/Settings";
import AuditLogPage from "@/pages/AuditLog";
import ReconciliationPage from "@/pages/Reconciliation";
import PerformancePage from "@/pages/Performance";
import OrdersPage from "@/pages/Orders";
import ComparePage from "@/pages/Compare";
import CorrelationPage from "@/pages/Correlation";
import CalendarPage from "@/pages/Calendar";
import CopyTradingPage from "@/pages/CopyTrading";
import CopyTradingDiscoverPage from "@/pages/CopyTradingDiscover";
import CopyTradingSettingsPage from "@/pages/CopyTradingSettings";
import AgentTasksPage from "@/pages/AgentTasks";
import AutoTraderPage from "@/pages/AutoTrader";
import ApiStatusModal from "@/components/ApiStatusModal";
import { SpotifyWidget } from "@/components/SpotifyWidget";
import GoldParticles from "@/components/GoldParticles";
import { CommandPalette } from "@/components/CommandPalette";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import Login from "@/pages/Login";
import SetupPassword from "@/pages/SetupPassword";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Bell, Bookmark, LayoutDashboard, Moon, Sun, Search, BookOpen, Settings, Newspaper, Building2, LogOut, ScrollText, Scale, LineChart, Receipt, GitCompare, Grid3x3, CalendarDays, Copy, Volume2, VolumeX, Bot, Cpu } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { initSoundPreference, setSoundEnabled, isSoundEnabled } from "@/lib/sounds";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 8_000 },
  },
});

function SolirisMark() {
  return (
    <div className="logo-emblem-wrap">
      <img src="/soliris-icon.svg" alt="Soliris Market" draggable={false} />
    </div>
  );
}

function Nav() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return true; // default to dark (Obsidian Luxe)
  });
  const [showApi, setShowApi] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled);

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
    { href: "/courtier", label: "Courtier", icon: Building2 },
    { href: "/copy-trading", label: "Copy Trading", icon: Copy },
    { href: "/performance", label: "Performance", icon: LineChart },
    { href: "/comparer", label: "Comparer", icon: GitCompare },
    { href: "/correlation", label: "Corrélation", icon: Grid3x3 },
    { href: "/calendrier", label: "Calendrier économique", icon: CalendarDays },
    { href: "/ordres", label: "Journal des ordres", icon: Receipt },
    { href: "/reconciliation", label: "Réconciliation", icon: Scale },
    { href: "/audit", label: "Journal d'audit", icon: ScrollText },
    { href: "/auto-trader", label: "Auto-Trader", icon: Cpu },
    { href: "/agent-tasks", label: "Tâches d'agent", icon: Bot },
    { href: "/parametres", label: "Paramètres", icon: Settings },
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
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto min-h-0">
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
            onClick={() => { import("@/lib/sounds").then(({ playSound }) => playSound("toggle")); setShowApi(true); }}
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
          <button
            onClick={() => {
              const next = !soundOn;
              setSoundEnabled(next);
              setSoundOn(next);
              // Jouer un son de confirmation si on vient d'activer
              if (next) {
                import("@/lib/sounds").then(({ playSound }) => playSound("toggle"));
              }
            }}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg w-full transition-all"
          >
            {soundOn ? <Volume2 className="w-4 h-4 flex-shrink-0" /> : <VolumeX className="w-4 h-4 flex-shrink-0" />}
            {soundOn ? "Sons activés" : "Sons désactivés"}
          </button>
          <Link
            href="/conditions-utilisation"
            className="link-underline flex items-center gap-2 px-3 py-2 text-[11px] text-sidebar-foreground/35 hover:text-sidebar-accent-foreground transition-colors w-fit"
          >
            Conditions d'utilisation
          </Link>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg w-full transition-all"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Déconnexion
          </button>
        </div>

        {/* Lecteur Spotify — widget persistant en bas de sidebar */}
        <SpotifyWidget />
      </aside>
    </>
  );
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen relative">
      <GoldParticles />
      <Nav />
      <div className="flex-1 ml-56 flex flex-col min-h-screen">
        <TradingModeBanner />
        <main className="flex-1 bg-background relative z-10">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * AuthGuard — protège toutes les routes de l'application (hors landing,
 * conditions d'utilisation et /login). Redirige vers /login en conservant
 * la destination visée dans ?next=, tant que la session n'est pas confirmée
 * authentifiée côté serveur. N'affiche jamais le contenu protégé pendant le
 * chargement — évite un flash de données réelles avant vérification.
 */
function AuthGuard({ children }: { children: ReactNode }) {
  const { authenticated, needsSetup, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (needsSetup) {
      navigate("/setup", { replace: true });
    } else if (!authenticated) {
      const next = encodeURIComponent(location);
      navigate(`/login?next=${next}`, { replace: true });
    }
  }, [isLoading, authenticated, needsSetup, location, navigate]);

  if (isLoading || !authenticated) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#07080a]" />
    );
  }

  return <>{children}</>;
}

/**
 * Ne monte la palette de commandes (et donc son hook de recherche protégé)
 * qu'une fois la session confirmée authentifiée — évite un appel API inutile
 * (et une 401 bruyante dans les logs) sur les écrans publics (landing, login).
 */
function AuthedCommandPalette() {
  const { authenticated } = useAuth();
  if (!authenticated) return null;
  return <CommandPalette />;
}

function wrap(name: string, Page: React.ComponentType) {
  return () => (
    <AuthGuard>
      <AppLayout>
        <PageErrorBoundary pageName={name}>
          <Page />
        </PageErrorBoundary>
      </AppLayout>
    </AuthGuard>
  );
}

function App() {
  // Lire la préférence son une seule fois au montage (avant toute interaction)
  useEffect(() => { initSoundPreference(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Switch>
              <Route path="/" component={Landing} />
              <Route path="/setup" component={SetupPassword} />
              <Route path="/login" component={Login} />
              <Route path="/conditions-utilisation" component={ConditionsUtilisation} />
              <Route path="/courtier" component={wrap("Courtier", BrokerPage)} />
              <Route path="/dashboard" component={wrap("Tableau de bord", Dashboard)} />
              <Route path="/search" component={wrap("Recherche", SearchPage)} />
              <Route path="/watchlist" component={wrap("Portefeuille suivi", Watchlist)} />
              <Route path="/alerts" component={wrap("Alertes prix", Alerts)} />
              <Route path="/journal" component={wrap("Journal des marchés", MarketNewsJournal)} />
              <Route path="/performance" component={wrap("Performance", PerformancePage)} />
              <Route path="/comparer" component={wrap("Comparer", ComparePage)} />
              <Route path="/correlation" component={wrap("Corrélation", CorrelationPage)} />
              <Route path="/calendrier" component={wrap("Calendrier économique", CalendarPage)} />
              <Route path="/ordres" component={wrap("Journal des ordres", OrdersPage)} />
              <Route path="/reconciliation" component={wrap("Réconciliation", ReconciliationPage)} />
              <Route path="/audit" component={wrap("Journal d'audit", AuditLogPage)} />
              <Route path="/agent-tasks" component={wrap("Tâches d'agent", AgentTasksPage)} />
              <Route path="/auto-trader" component={wrap("Auto-Trader", AutoTraderPage)} />
              <Route path="/parametres" component={wrap("Paramètres", SettingsPage)} />
              <Route path="/copy-trading/decouvrir" component={wrap("Découvrir des traders", CopyTradingDiscoverPage)} />
              <Route path="/copy-trading/parametres/:id" component={wrap("Paramètres trader", CopyTradingSettingsPage)} />
              <Route path="/copy-trading" component={wrap("Copy Trading", CopyTradingPage)} />
              <Route path="/apprendre/chandeliers/:slug" component={wrap("Chandeliers", CandleDetail)} />
              <Route path="/apprendre/strategies/:slug" component={wrap("Stratégies", StrategyDetail)} />
              <Route path="/apprendre/glossaire/:slug" component={wrap("Glossaire", GlossaryDetail)} />
              <Route path="/apprendre/:tab" component={wrap("Apprendre", Learn)} />
              <Route path="/apprendre" component={wrap("Apprendre", Learn)} />
              <Route path="/quote/:symbol" component={wrap("Fiche du titre", QuoteDetail)} />
              <Route component={wrap("Page introuvable", NotFound)} />
            </Switch>
          </WouterRouter>
          <AuthedCommandPalette />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
