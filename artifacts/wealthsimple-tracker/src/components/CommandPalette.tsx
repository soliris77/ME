import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useSearchSymbols } from "@workspace/api-client-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Search,
  LayoutDashboard,
  Bookmark,
  Bell,
  Newspaper,
  BookOpen,
  Building2,
  Settings2,
  ScrollText,
  Scale,
  LineChart,
  TrendingUp,
  Layers,
  Bitcoin,
  Globe,
  BarChart2,
  Receipt,
  GitCompare,
  Grid3x3,
  CalendarDays,
} from "lucide-react";

const TYPE_ICONS: Record<string, typeof TrendingUp> = {
  stock: TrendingUp,
  etf: Layers,
  crypto: Bitcoin,
  index: BarChart2,
  commodity: Globe,
  currency: Globe,
};

const DESTINATIONS = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/search", label: "Rechercher un actif", icon: Search },
  { href: "/watchlist", label: "Portefeuille suivi", icon: Bookmark },
  { href: "/alerts", label: "Alertes prix", icon: Bell },
  { href: "/journal", label: "Journal des marchés", icon: Newspaper },
  { href: "/apprendre", label: "Apprendre à trader", icon: BookOpen },
  { href: "/courtier", label: "Courtier", icon: Building2 },
  { href: "/parametres", label: "Paramètres — seuils de risque", icon: Settings2 },
  { href: "/audit", label: "Journal d'audit", icon: ScrollText },
  { href: "/reconciliation", label: "Réconciliation des positions", icon: Scale },
  { href: "/performance", label: "Dashboard de performance", icon: LineChart },
  { href: "/comparer", label: "Comparer des actifs", icon: GitCompare },
  { href: "/correlation", label: "Corrélation entre actifs", icon: Grid3x3 },
  { href: "/calendrier", label: "Calendrier économique", icon: CalendarDays },
  { href: "/ordres", label: "Journal des ordres", icon: Receipt },
];

/**
 * Palette de commandes globale (Cmd/Ctrl+K) — navigation directe vers
 * n'importe quel symbole (recherche floue, même moteur que /search) ou
 * n'importe quelle page de l'app, sans avoir à cliquer à travers la barre
 * latérale. Montée une seule fois au niveau App, au-dessus de toutes les
 * routes protégées, pour rester disponible depuis n'importe quel écran.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      // "/" ouvre aussi la palette (habitude commune à beaucoup d'apps),
      // sauf si l'utilisateur est déjà en train de taper dans un champ.
      if (e.key === "/" && !open) {
        const target = e.target as HTMLElement | null;
        const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        if (!typing) {
          e.preventDefault();
          setOpen(true);
          return;
        }
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const { data: results = [], isLoading } = useSearchSymbols(
    { q: debouncedQuery },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: debouncedQuery.length >= 1 } as any }
  );

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      navigate(href);
    },
    [navigate]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Rechercher un symbole (ex: AAPL, XEQT.TO) ou une page…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {debouncedQuery ? (
          <>
            {isLoading && (
              <div className="py-6 text-center text-sm text-muted-foreground">Recherche…</div>
            )}
            {!isLoading && results.length === 0 && (
              <CommandEmpty>Aucun résultat pour « {debouncedQuery} »</CommandEmpty>
            )}
            {!isLoading && results.length > 0 && (
              <CommandGroup heading="Symboles">
                {results.slice(0, 8).map((r) => {
                  const Icon = TYPE_ICONS[r.type] ?? TrendingUp;
                  return (
                    <CommandItem
                      key={r.symbol}
                      value={`${r.symbol} ${r.name}`}
                      onSelect={() => go(`/quote/${encodeURIComponent(r.symbol)}`)}
                    >
                      <Icon className="text-muted-foreground" />
                      <span className="font-mono font-semibold">{r.symbol}</span>
                      <span className="text-muted-foreground truncate">{r.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </>
        ) : (
          <CommandEmpty>Tapez un symbole ou un nom d'entreprise…</CommandEmpty>
        )}

        <CommandSeparator />

        <CommandGroup heading="Aller à">
          {DESTINATIONS.map(({ href, label, icon: Icon }) => (
            <CommandItem key={href} value={label} onSelect={() => go(href)}>
              <Icon className="text-muted-foreground" />
              <span>{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
