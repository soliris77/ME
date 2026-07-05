import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Watchlist from "@/pages/Watchlist";
import Alerts from "@/pages/Alerts";
import QuoteDetail from "@/pages/QuoteDetail";
import SearchPage from "@/pages/Search";
import { BarChart2, Bell, Bookmark, LayoutDashboard, Moon, Sun, Search } from "lucide-react";
import { useState, useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 20_000 },
  },
});

function Nav() {
  const [location] = useLocation();
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const links = [
    { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
    { href: "/search", label: "Rechercher", icon: Search },
    { href: "/watchlist", label: "Portefeuille suivi", icon: Bookmark },
    { href: "/alerts", label: "Alertes prix", icon: Bell },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-sidebar border-r border-sidebar-border flex flex-col z-30">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-sidebar-primary flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <span className="text-sidebar-foreground font-semibold text-sm tracking-tight">WS Marchés</span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
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
      <div className="px-3 py-4 border-t border-sidebar-border">
        <button
          onClick={() => setDark((d) => !d)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded w-full transition-colors"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {dark ? "Mode clair" : "Mode sombre"}
        </button>
      </div>
    </aside>
  );
}

function Router() {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="flex-1 ml-56 min-h-screen bg-background">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/search" component={SearchPage} />
          <Route path="/watchlist" component={Watchlist} />
          <Route path="/alerts" component={Alerts} />
          <Route path="/quote/:symbol" component={QuoteDetail} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
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
