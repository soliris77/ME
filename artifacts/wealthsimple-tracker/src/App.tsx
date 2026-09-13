import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { MotionConfig } from "framer-motion";
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
import LessonDetail from "@/pages/learn/LessonDetail";
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
import ScannerPage from "@/pages/Scanner";
import DebriefPage from "@/pages/Debrief";
import ApiStatusModal from "@/components/ApiStatusModal";
import GoldParticles from "@/components/GoldParticles";
import { CommandPalette } from "@/components/CommandPalette";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import Login from "@/pages/Login";
import SetupPassword from "@/pages/SetupPassword";
import Pricing from "@/pages/Pricing";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Activity, Bell, Bookmark, LayoutDashboard, Moon, Sun, Search, BookOpen, Settings, Newspaper, Building2, LogOut, ScrollText, Scale, LineChart, Receipt, GitCompare, Grid3x3, CalendarDays, CalendarCheck, Copy, Volume2, VolumeX, Bot, Cpu, Calculator, Eye, EyeOff, Radar } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { initSoundPreference, setSoundEnabled, isSoundEnabled } from "@/lib/sounds";
import { isMotionForced, setMotionForced, subscribeMotion } from "@/lib/motion";
import { PositionCalculator } from "@/components/PositionCalculator";
import { useQuery } from "@tanstack/react-query";

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

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Hook léger : compte les alertes actives pour le badge dans la sidebar */
function useActiveAlertsCount() {
  const { data } = useQuery<{ active: boolean }[]>({
    queryKey: ["nav-alerts-count"],
    queryFn: () => fetch(`${BASE_URL}/api/alerts`).then((r) => r.json()),
    refetchInterval: 30_000,
    staleTime: 20_000,
    // On ne bloque pas le rendu si la requête échoue
    retry: false,
  });
  return Array.isArray(data) ? data.filter((a) => a.active).length : 0;
}

/**
 * Badge « non lu » du centre de notifications : compte les notifications
 * envoyées pas encore consultées. S'éteint quand l'utilisateur consulte
 * l'historique sur la page Alertes.
 */
function useUnreadNotificationsCount() {
  const { data } = useQuery<{ count: number }>({
    queryKey: ["nav-notifications-unread"],
    queryFn: () => fetch(`${BASE_URL}/api/notifications/unread-count`).then((r) => r.json()),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: false,
  });
  return typeof data?.count === "number" ? data.count : 0;
}

/**
 * Surveille les alertes déclenchées et émet une notification navigateur —
 * fonctionne de façon fiable tant que l'onglet est ouvert, même en
 * arrière-plan (les timers ≥ 60 s ne sont pas supprimés par le throttling
 * des onglets inactifs). Les notifications passent par le Service Worker
 * (registration.showNotification) quand il est disponible : elles restent
 * visibles et cliquables même si l'onglet perd ensuite le focus.
 * Complété par le Periodic Background Sync du SW (Chrome/Edge, PWA
 * installée) qui couvre opportunistiquement le cas onglet fermé.
 */
const NOTIFIED_IDS_KEY = "soliris-notified-alert-ids";
function Nav() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return true; // default to dark (Obsidian Luxe)
  });
  const [showApi, setShowApi] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled);
  const [privacy, setPrivacy] = useState(() => localStorage.getItem("privacy") === "on");
  const [motionOn, setMotionOn] = useState(isMotionForced);
  const activeAlertsCount = useActiveAlertsCount();
  const unreadNotifsCount = useUnreadNotificationsCount();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // Mode confidentialité : floute les montants sensibles (classe .sensitive)
  useEffect(() => {
    document.documentElement.classList.toggle("privacy", privacy);
    localStorage.setItem("privacy", privacy ? "on" : "off");
  }, [privacy]);

  // La preference vit dans lib/motion : on suit ses changements, d'ou
  // qu'ils viennent.
  useEffect(() => subscribeMotion((value) => setMotionOn(value === "full")), []);

  const links = [
    {
      group: "Marchés & Analyse",
      items: [
        { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
        { href: "/search", label: "Recherche", icon: Search },
        { href: "/watchlist", label: "Portefeuille suivi", icon: Bookmark },
        { href: "/journal", label: "Journal des marchés", icon: Newspaper },
        { href: "/calendrier", label: "Calendrier éco", icon: CalendarDays },
      ]
    },
    {
      group: "Trading & Exécution",
      items: [
        { href: "/ordres", label: "Journal des ordres", icon: Receipt },
        { href: "/auto-trader", label: "Auto-Trader", icon: Cpu },
        { href: "/scanner", label: "Scanner & Signaux", icon: Radar },
        { href: "/copy-trading", label: "Copy Trading", icon: Copy },
        { href: "/agent-tasks", label: "Tâches agent", icon: Bot },
        { href: "/courtier", label: "Courtier", icon: Building2 },
      ]
    },
    {
      group: "Performance & Suivi",
      items: [
        { href: "/performance", label: "Performance", icon: LineChart },
        { href: "/comparer", label: "Comparer", icon: GitCompare },
        { href: "/correlation", label: "Corrélation", icon: Grid3x3 },
        { href: "/debrief", label: "Débriefing", icon: CalendarCheck },
        { href: "/reconciliation", label: "Réconciliation", icon: Scale },
      ]
    },
    {
      group: "Système",
      items: [
        { href: "/alerts", label: "Alertes prix", icon: Bell },
        { href: "/apprendre", label: "Apprendre", icon: BookOpen },
        { href: "/audit", label: "Audit", icon: ScrollText },
        { href: "/parametres", label: "Paramètres", icon: Settings },
      ]
    }
  ];

  return (
    <>
      {showApi  && <ApiStatusModal onClose={() => setShowApi(false)} />}
      {showCalc && <PositionCalculator onClose={() => setShowCalc(false)} />}
      <aside className="fixed inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-30 shadow-2xl">
        {/* Logo */}
        <div className="px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="logo-glow rounded-full flex-shrink-0">
              <SolirisMark />
            </div>
            <div className="leading-none">
              <div className="brand-mark text-sidebar-primary font-semibold text-[14px] tracking-[0.2em]">SOLIRIS</div>
              <div className="text-sidebar-foreground/40 text-[9px] tracking-[0.38em] mt-0.5">MARKET</div>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto min-h-0 custom-scrollbar">
          {links.map((group, idx) => (
            <div key={idx}>
              <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/30">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = location.startsWith(href);
                  const isAlerts = href === "/alerts";
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-300 ease-out ${
                        active ? "bg-sidebar-primary/10 text-sidebar-primary shadow-[inset_2px_0_0_0_hsl(var(--sidebar-primary))]" : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <span className="relative flex-shrink-0">
                        <Icon className={`w-4 h-4 transition-colors ${active ? "text-sidebar-primary" : "opacity-70"}`} />
                        {isAlerts && activeAlertsCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground flex items-center justify-center leading-none animate-pulse">
                            {activeAlertsCount > 9 ? "9+" : activeAlertsCount}
                          </span>
                        )}
                      </span>
                      <span className="flex-1">{label}</span>
                      {isAlerts && unreadNotifsCount > 0 && (
                        <span
                          className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center leading-none shadow-sm"
                          title={`${unreadNotifsCount} notification${unreadNotifsCount > 1 ? "s" : ""} non lue${unreadNotifsCount > 1 ? "s" : ""}`}
                        >
                          {unreadNotifsCount > 99 ? "99+" : unreadNotifsCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="gold-divider opacity-50" />

        {/* Footer */}
        <div className="px-3 py-3 space-y-0.5 bg-sidebar-accent/10">
          <button
            onClick={() => setShowCalc(true)}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg w-full transition-all"
          >
            <Calculator className="w-4 h-4 flex-shrink-0" />
            Taille de position
          </button>
          <button
            onClick={() => { import("@/lib/sounds").then(({ playSound }) => playSound("toggle")); setShowApi(true); }}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg w-full transition-all"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            Coûts API &amp; données
          </button>
          <button
            onClick={() => setPrivacy((p) => !p)}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg w-full transition-all"
            title="Floute les soldes et montants sensibles (partage d'écran, lieu public)"
          >
            {privacy ? <Eye className="w-4 h-4 flex-shrink-0" /> : <EyeOff className="w-4 h-4 flex-shrink-0" />}
            {privacy ? "Afficher les montants" : "Masquer les montants"}
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
          <button
            onClick={() => setMotionForced(!motionOn)}
            title={motionOn ? "Les animations tournent, meme si ton systeme demande de les reduire" : "Les animations suivent le reglage de ton systeme"}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg w-full transition-all"
          >
            <Activity className="w-4 h-4 flex-shrink-0" />
            {motionOn ? "Mouvement activé" : "Mouvement système"}
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

      </aside>
    </>
  );
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen relative">
      <GoldParticles />
      <Nav />
      <div className="flex-1 min-w-0 ml-64 flex flex-col min-h-screen">
        <TradingModeBanner />
        <main className="flex-1 min-w-0 bg-background relative z-10">
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

  // MotionConfig doit suivre la bascule, qui vit dans Nav.
  const [motionOn, setMotionOn] = useState(isMotionForced);
  useEffect(() => subscribeMotion((value) => setMotionOn(value === "full")), []);

  return (
    <MotionConfig reducedMotion={motionOn ? "never" : "user"}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Switch>
              <Route path="/" component={Landing} />
              <Route path="/setup" component={SetupPassword} />
              <Route path="/login" component={Login} />
              <Route path="/pricing" component={Pricing} />
              <Route path="/tarifs" component={Pricing} />
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
              <Route path="/debrief" component={wrap("Débriefing quotidien", DebriefPage)} />
              <Route path="/reconciliation" component={wrap("Réconciliation", ReconciliationPage)} />
              <Route path="/audit" component={wrap("Journal d'audit", AuditLogPage)} />
              <Route path="/agent-tasks" component={wrap("Tâches d'agent", AgentTasksPage)} />
              <Route path="/auto-trader" component={wrap("Auto-Trader", AutoTraderPage)} />
            <Route path="/scanner" component={wrap("Scanner & Signaux", ScannerPage)} />
              <Route path="/parametres" component={wrap("Paramètres", SettingsPage)} />
              <Route path="/copy-trading/decouvrir" component={wrap("Découvrir des traders", CopyTradingDiscoverPage)} />
              <Route path="/copy-trading/parametres/:id" component={wrap("Paramètres trader", CopyTradingSettingsPage)} />
              <Route path="/copy-trading" component={wrap("Copy Trading", CopyTradingPage)} />
              <Route path="/apprendre/parcours/:slug" component={wrap("Leçon", LessonDetail)} />
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
          <AlertNotificationWatcher />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
    </MotionConfig>
  );
}

export default App;

function alertNotificationBody(a: {
  alertType?: string; symbol: string; patternSignal?: string | null;
  condition?: string | null; targetPrice?: number | null;
}) {
  if (a.alertType === "pattern") return `Pattern ${a.patternSignal || "détecté"} sur ${a.symbol}`;
  if (a.alertType === "signal") return `Signal technique ${a.patternSignal || "composite"} sur ${a.symbol}`;
  const dir = a.condition === "above" ? "au-dessus" : "en dessous";
  const target = a.targetPrice != null ? ` de ${a.targetPrice} $` : "";
  return `${a.symbol} est passé ${dir}${target}`;
}

function AlertNotificationWatcher() {
  const { authenticated } = useAuth();

  useEffect(() => {
    if (!authenticated || !("Notification" in window)) return;

    const check = async () => {
      if (Notification.permission !== "granted") return;
      try {
        const res = await fetch(`${BASE_URL}/api/alerts`, { credentials: "same-origin" });
        if (!res.ok) return;
        const alerts: {
          id: number; active: boolean; triggeredAt?: string | null; symbol: string;
          alertType?: string; patternSignal?: string | null; condition?: string | null; targetPrice?: number | null;
        }[] = await res.json();
        if (!Array.isArray(alerts)) return;

        const triggered = alerts.filter((a) => !a.active && a.triggeredAt);
        const raw = localStorage.getItem(NOTIFIED_IDS_KEY);
        // Premier passage : on mémorise l'existant sans notifier (évite une
        // rafale de notifications historiques).
        const firstRun = raw == null;
        const seen = new Set<number>(firstRun ? [] : (JSON.parse(raw) as number[]));
        const fresh = firstRun ? [] : triggered.filter((a) => !seen.has(a.id));

        for (const a of fresh) {
          const title = `🔔 Alerte ${a.symbol}`;
          const options: NotificationOptions = {
            body: alertNotificationBody(a),
            icon: "/icon-192.png",
            // Même tag que le SW → jamais de doublon si les deux chemins notifient
            tag: `soliris-alert-${a.id}`,
          };
          try {
            // Notification persistante via le SW si dispo (reste cliquable,
            // redirige vers /alerts via le handler notificationclick du SW)
            const reg = await navigator.serviceWorker?.ready;
            if (reg) await reg.showNotification(title, { ...options, data: { url: "/alerts" } });
            else new Notification(title, options);
          } catch {
            try { new Notification(title, options); } catch { /* plateforme sans notifications */ }
          }
        }

        localStorage.setItem(NOTIFIED_IDS_KEY, JSON.stringify(triggered.map((a) => a.id)));
      } catch {
        /* hors-ligne ou API indisponible — on réessaie au prochain tick */
      }
    };

    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [authenticated]);

  return null;
}
