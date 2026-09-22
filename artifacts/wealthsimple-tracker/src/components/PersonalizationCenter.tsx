import { useState, type DragEvent, type ReactNode } from "react";
import {
  Accessibility,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Gauge,
  GripVertical,
  Info,
  Keyboard,
  LayoutDashboard,
  MousePointer2,
  Palette,
  PanelsTopLeft,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  DASHBOARD_MODULE_LABELS,
  DASHBOARD_MODULES,
  type DashboardLayout,
  type DashboardModuleId,
  type DensityPreference,
  type ThemePreference,
  useUserPreferences,
} from "@/lib/userPreferences";

type PersonalizationSection =
  | "appearance"
  | "interface"
  | "dashboard"
  | "animations"
  | "cursor"
  | "density"
  | "accessibility"
  | "shortcuts";

const SECTIONS: {
  id: PersonalizationSection;
  label: string;
  icon: typeof Palette;
}[] = [
  { id: "appearance", label: "Apparence", icon: Palette },
  { id: "interface", label: "Interface", icon: PanelsTopLeft },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "animations", label: "Animations", icon: Sparkles },
  { id: "cursor", label: "Curseur", icon: MousePointer2 },
  { id: "density", label: "Densité", icon: Gauge },
  { id: "accessibility", label: "Accessibilité", icon: Accessibility },
  { id: "shortcuts", label: "Raccourcis", icon: Keyboard },
];

const DASHBOARD_LAYOUTS: { id: DashboardLayout; label: string; description: string }[] = [
  { id: "standard", label: "Standard", description: "Lecture équilibrée recommandée." },
  { id: "analysis", label: "Analyse", description: "Données et graphiques prioritaires." },
  { id: "compact", label: "Compact", description: "Plus d'informations à l'écran." },
  { id: "immersive", label: "Immersif", description: "Plus de place pour l'Observatoire." },
];

const DENSITIES: { id: DensityPreference; label: string; description: string }[] = [
  { id: "compact", label: "Compact", description: "Cartes serrées, lecture rapide." },
  { id: "standard", label: "Standard", description: "Configuration Soliris recommandée." },
  { id: "comfort", label: "Confort", description: "Espaces et textes plus respirants." },
];

function ChoiceButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-w-0 rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        active
          ? "border-primary/55 bg-primary/10 text-foreground"
          : "border-border/50 bg-background/20 text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
        {active && <Check className="h-3.5 w-3.5 text-primary" />}
        {label}
      </span>
      {description && <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{description}</span>}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-border/25 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground/90">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
      />
    </label>
  );
}

function SettingCard({ children }: { children: ReactNode }) {
  return <div className="surface-glass rounded-xl border border-border/40 p-5 md:p-6">{children}</div>;
}

export default function PersonalizationCenter() {
  const {
    preferences,
    systemReducedMotion,
    updatePreferences,
    setDashboardModuleVisibility,
    moveDashboardModule,
    saveProfile,
    loadProfile,
    deleteProfile,
    resetPreferences,
  } = useUserPreferences();
  const [activeSection, setActiveSection] = useState<PersonalizationSection>("appearance");
  const [draggedModule, setDraggedModule] = useState<DashboardModuleId | null>(null);
  const [profileName, setProfileName] = useState("");

  const applyLayout = (layout: DashboardLayout) => {
    const layoutOrder: Record<DashboardLayout, DashboardModuleId[]> = {
      standard: [...DASHBOARD_MODULES],
      analysis: [
        "market-pulse",
        "major-markets",
        "sectors",
        "alternative-assets",
        "daily-movers",
        "market-status",
        "risk-command",
        "observatory",
        "popular-assets",
        "popular-stocks",
      ],
      compact: [...DASHBOARD_MODULES],
      immersive: [
        "market-pulse",
        "observatory",
        "major-markets",
        "alternative-assets",
        "sectors",
        "market-status",
        "risk-command",
        "daily-movers",
        "popular-assets",
        "popular-stocks",
      ],
    };
    updatePreferences({
      dashboardLayout: layout,
      dashboardOrder: layoutOrder[layout],
      ...(layout === "analysis" ? { density: "compact" } : {}),
      ...(layout === "compact" ? { density: "compact" } : {}),
    });
  };

  const moveModuleUp = (id: DashboardModuleId) => {
    const index = preferences.dashboardOrder.indexOf(id);
    if (index > 0) moveDashboardModule(id, preferences.dashboardOrder[index - 1]);
  };

  const moveModuleDown = (id: DashboardModuleId) => {
    const index = preferences.dashboardOrder.indexOf(id);
    const next = preferences.dashboardOrder[index + 1];
    if (next) moveDashboardModule(next, id);
  };

  const dropModule = (event: DragEvent<HTMLDivElement>, targetId: DashboardModuleId) => {
    event.preventDefault();
    if (draggedModule && draggedModule !== targetId) moveDashboardModule(draggedModule, targetId);
    setDraggedModule(null);
  };

  return (
    <section className="mb-12" aria-labelledby="personalization-title">
      <div className="mb-6">
        <div className="section-rule mb-4"><span>PERSONNALISATION</span></div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="personalization-title" className="flex items-center gap-2.5 text-2xl font-semibold tracking-[0.08em] brand-mark">
              <Palette className="h-5 w-5 text-primary" />
              Mon espace Soliris
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Choisis ce qui est visible, l’ordre de lecture et le niveau de mouvement. Les données financières et les modules existants restent inchangés.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Restaurer les paramètres par défaut ?")) resetPreferences();
            }}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav className="self-start rounded-xl border border-border/35 bg-background/20 p-2 lg:sticky lg:top-5" aria-label="Catégories de personnalisation">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              aria-current={activeSection === id ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                activeSection === id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {activeSection === "appearance" && (
            <SettingCard>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Thème</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Conserve l’identité Soliris, avec une préférence claire pour l’environnement.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <ChoiceButton label="Système" description="Suit le système d'exploitation." active={preferences.theme === "system"} onClick={() => updatePreferences({ theme: "system" })} />
                <ChoiceButton label="Soliris Dark" description="Obsidienne et or, mode historique." active={preferences.theme === "dark"} onClick={() => updatePreferences({ theme: "dark" })} />
                <ChoiceButton label="Soliris Light" description="Version claire, sans thème flashy." active={preferences.theme === "light"} onClick={() => updatePreferences({ theme: "light" })} />
              </div>
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] p-3 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/75" />
                Le changement s’applique immédiatement et est conservé dans cet espace de travail.
              </div>
            </SettingCard>
          )}

          {activeSection === "interface" && (
            <SettingCard>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Interface</h2>
              <div className="mt-4 space-y-1">
                <ToggleRow label="Sidebar ouverte" description="Garde les libellés visibles sur grand écran." checked={preferences.sidebar.mode === "open"} onChange={(checked) => updatePreferences({ sidebar: { mode: checked ? "open" : "auto" } })} />
                <ToggleRow label="Libellés de navigation" description="Affiche les noms à côté des icônes." checked={preferences.sidebar.labels} onChange={(labels) => updatePreferences({ sidebar: { labels } })} />
                <ToggleRow label="Ouverture immersive de l'Observatoire" description="Autorise la page Observatoire à utiliser son mode immersif par défaut." checked={preferences.immersive.observatoryAuto} onChange={(observatoryAuto) => updatePreferences({ immersive: { observatoryAuto } })} />
                <ToggleRow label="Sons d'interface" description="Conserve les sons existants de Soliris, sans en ajouter de nouveaux." checked={preferences.sound} onChange={(sound) => updatePreferences({ sound })} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {(["auto", "open", "collapsed"] as const).map((mode) => (
                  <ChoiceButton key={mode} label={mode === "auto" ? "Automatique" : mode === "open" ? "Toujours ouverte" : "Réduite par défaut"} active={preferences.sidebar.mode === mode} onClick={() => updatePreferences({ sidebar: { mode } })} />
                ))}
              </div>
              <div className="mt-6 border-t border-border/30 pt-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Profils de configuration</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Enregistre plusieurs arrangements d’interface sans toucher aux données financières.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label className="sr-only" htmlFor="profile-name">Nom du profil</label>
                  <input
                    id="profile-name"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder="Ex. Analyse"
                    maxLength={32}
                    className="min-w-0 flex-1 rounded-md border border-border/50 bg-background/30 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  />
                  <button
                    type="button"
                    disabled={!profileName.trim()}
                    onClick={() => {
                      saveProfile(profileName);
                      setProfileName("");
                    }}
                    className="rounded-md border border-primary/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-primary transition-colors hover:bg-primary/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    Enregistrer
                  </button>
                </div>
                {Object.keys(preferences.profiles).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.keys(preferences.profiles).map((name) => (
                      <div key={name} className={`flex items-center gap-1 rounded-md border px-2 py-1.5 ${preferences.activeProfile === name ? "border-primary/45 bg-primary/[0.07]" : "border-border/35"}`}>
                        <button type="button" onClick={() => loadProfile(name)} className="text-[11px] text-foreground/85 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">{name}</button>
                        <button type="button" aria-label={`Supprimer le profil ${name}`} onClick={() => deleteProfile(name)} className="rounded p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SettingCard>
          )}

          {activeSection === "dashboard" && (
            <SettingCard>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Modules visibles et ordre</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Glisse une ligne pour la déplacer. Les boutons haut/bas offrent la même action au clavier.</p>
              <div className="mt-5 space-y-2">
                {preferences.dashboardOrder.map((id, index) => (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => setDraggedModule(id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropModule(event, id)}
                    onDragEnd={() => setDraggedModule(null)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                      draggedModule === id ? "border-primary/60 bg-primary/[0.08]" : "border-border/35 bg-background/20"
                    }`}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-sm text-foreground/90">{DASHBOARD_MODULE_LABELS[id]}</span>
                    <button type="button" aria-label={`Masquer ${DASHBOARD_MODULE_LABELS[id]}`} aria-pressed={preferences.dashboardVisibility[id]} onClick={() => setDashboardModuleVisibility(id, !preferences.dashboardVisibility[id])} className={`rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${preferences.dashboardVisibility[id] ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted/40"}`}>
                      {preferences.dashboardVisibility[id] ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button type="button" aria-label={`Monter ${DASHBOARD_MODULE_LABELS[id]}`} disabled={index === 0} onClick={() => moveModuleUp(id)} className="rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label={`Descendre ${DASHBOARD_MODULE_LABELS[id]}`} disabled={index === preferences.dashboardOrder.length - 1} onClick={() => moveModuleDown(id)} className="rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-border/30 pt-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Disposition</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {DASHBOARD_LAYOUTS.map((layout) => (
                    <ChoiceButton key={layout.id} label={layout.label} description={layout.description} active={preferences.dashboardLayout === layout.id} onClick={() => applyLayout(layout.id)} />
                  ))}
                </div>
              </div>
            </SettingCard>
          )}

          {activeSection === "animations" && (
            <SettingCard>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Intensité des animations</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Les mouvements restent soumis à la préférence de réduction du système.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <ChoiceButton label="Complètes" description="Animations normales de Soliris." active={preferences.animations === "full"} onClick={() => updatePreferences({ animations: "full" })} />
                <ChoiceButton label="Réduites" description="Transitions et effets raccourcis." active={preferences.animations === "reduced"} onClick={() => updatePreferences({ animations: "reduced" })} />
                <ChoiceButton label="Minimales" description="Interface presque statique." active={preferences.animations === "minimal"} onClick={() => updatePreferences({ animations: "minimal" })} />
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">{systemReducedMotion ? "Le système demande actuellement la réduction des mouvements." : "Le système n’impose pas de réduction des mouvements."}</p>
            </SettingCard>
          )}

          {activeSection === "cursor" && (
            <SettingCard>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Curseur Soliris</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Le CustomCursor existant reste le seul curseur de l’application.</p>
              <div className="mt-4 space-y-1">
                <ToggleRow label="Curseur personnalisé" description="Désactive-le si tu préfères le curseur natif." checked={preferences.cursor.enabled} onChange={(enabled) => updatePreferences({ cursor: { enabled } })} />
                <ToggleRow label="Halo" description="Lumière dorée très légère autour du pointeur." checked={preferences.cursor.halo} onChange={(halo) => updatePreferences({ cursor: { halo } })} />
                <ToggleRow label="Réticule" description="Repère central utilisé dans les zones d'observation." checked={preferences.cursor.reticle} onChange={(reticle) => updatePreferences({ cursor: { reticle } })} />
                <ToggleRow label="Effet au survol" description="Réponse légère sur les cartes interactives." checked={preferences.cursor.hover} onChange={(hover) => updatePreferences({ cursor: { hover } })} />
                <ToggleRow label="Effet au clic" description="Retour visuel court à l'activation." checked={preferences.cursor.click} onChange={(click) => updatePreferences({ cursor: { click } })} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {(["low", "standard", "strong"] as const).map((intensity) => (
                  <ChoiceButton key={intensity} label={intensity === "low" ? "Faible" : intensity === "standard" ? "Standard" : "Renforcée"} active={preferences.cursor.intensity === intensity} onClick={() => updatePreferences({ cursor: { intensity } })} />
                ))}
              </div>
            </SettingCard>
          )}

          {activeSection === "density" && (
            <SettingCard>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Densité globale</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Le choix agit sur l’espacement de l’interface sans redimensionner arbitrairement les chiffres importants.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {DENSITIES.map((density) => (
                  <ChoiceButton key={density.id} label={density.label} description={density.description} active={preferences.density === density.id} onClick={() => updatePreferences({ density: density.id })} />
                ))}
              </div>
            </SettingCard>
          )}

          {activeSection === "accessibility" && (
            <SettingCard>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Accessibilité</h2>
              <div className="mt-4 space-y-1">
                <ToggleRow label="Contraste renforcé" description="Renforce les bordures et les textes secondaires." checked={preferences.accessibility.highContrast} onChange={(highContrast) => updatePreferences({ accessibility: { highContrast } })} />
                <ToggleRow label="Anneaux de focus visibles" description="Conserve un repère clair pour la navigation au clavier." checked={preferences.accessibility.focusRings} onChange={(focusRings) => updatePreferences({ accessibility: { focusRings } })} />
                <ToggleRow label="Valeurs compactes" description="Réduit les libellés non essentiels lorsque l’espace est limité." checked={preferences.dataDisplay.compactValues} onChange={(compactValues) => updatePreferences({ dataDisplay: { compactValues } })} />
                <ToggleRow label="Afficher les symboles" description="Conserve les tickers à côté des noms d’actifs." checked={preferences.dataDisplay.showSymbols} onChange={(showSymbols) => updatePreferences({ dataDisplay: { showSymbols } })} />
                <ToggleRow label="Afficher les unités" description="Conserve les devises et unités disponibles." checked={preferences.dataDisplay.showUnits} onChange={(showUnits) => updatePreferences({ dataDisplay: { showUnits } })} />
                <ToggleRow label="Afficher les timestamps" description="Conserve les indications de fraîcheur lorsqu’elles existent." checked={preferences.dataDisplay.showTimestamps} onChange={(showTimestamps) => updatePreferences({ dataDisplay: { showTimestamps } })} />
              </div>
            </SettingCard>
          )}

          {activeSection === "shortcuts" && (
            <SettingCard>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Raccourcis existants</h2>
              <div className="mt-4 divide-y divide-border/25">
                {[
                  ["⌘/Ctrl + K", "Ouvrir la palette de commandes et la recherche globale"],
                  ["/", "Ouvrir la palette depuis une page hors champ de saisie"],
                  ["Échap", "Fermer la palette ou sortir d’un état contextuel"],
                ].map(([shortcut, description]) => (
                  <div key={shortcut} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="text-sm text-foreground/90">{description}</span>
                    <kbd className="rounded border border-border/50 bg-background/40 px-2 py-1 font-mono text-[11px] text-primary">{shortcut}</kbd>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Les raccourcis restent ceux de la navigation existante; cette page ne crée pas un second système de commandes.</p>
            </SettingCard>
          )}
        </div>
      </div>
    </section>
  );
}