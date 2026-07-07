import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
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
import { Bell, Bookmark, LayoutDashboard, Moon, Sun, Search, BookOpen, Settings, Newspaper } from "lucide-react";
import { useState, useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 8_000 },
  },
});

function LionMark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/lion-emblem.png"
      alt="Emblème Soliris Market"
      className={`${className} rounded-full object-cover bg-black`}
    />
  );
}

function Nav() {
  const [location] = useLocation();
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
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
        <div className="px-5 py-5">
          <div className="flex items-center gap-2.5">
            <LionMark className="w-9 h-9 flex-shrink-0" />
            <div className="leading-tight">
              <div className="brand-mark text-sidebar-primary font-semibold text-[15px]">SOLIRIS</div>
              <div className="text-sidebar-foreground/60 text-[10px] tracking-[0.3em] -mt-0.5">MARKET</div>
            </div>
          </div>
        </div>
        <div className="gold-divider" />
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-sidebar-border space-y-0.5">
          <button
            onClick={() => setShowApi(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded w-full transition-colors"
          >
            <Settings className="w-4 h-4" />
            Coûts API &amp; données
          </button>
          <button
            onClick={() => setDark((d) => !d)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded w-full transition-colors"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {dark ? "Mode clair" : "Mode sombre"}
          </button>
        </div>
      </aside>
    </>
  );
}

function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="flex-1 ml-56 min-h-screen bg-background">
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/search" component={SearchPage} />
          <Route path="/watchlist" component={Watchlist} />
          <Route path="/alerts" component={Alerts} />
          <Route path="/journal" component={MarketNewsJournal} />
          <Route path="/apprendre" component={Learn} />
          <Route path="/apprendre/chandeliers/:slug" component={CandleDetail} />
          <Route path="/apprendre/strategies/:slug" component={StrategyDetail} />
          <Route path="/apprendre/glossaire/:slug" component={GlossaryDetail} />
          <Route path="/apprendre/:tab" component={Learn} />
          <Route path="/quote/:symbol" component={QuoteDetail} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/:rest*" component={AppShell} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
