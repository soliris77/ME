import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "dark" | "light";
export type DensityPreference = "compact" | "standard" | "comfort";
export type AnimationPreference = "full" | "reduced" | "minimal";
export type CursorIntensity = "low" | "standard" | "strong";
export type SidebarMode = "auto" | "open" | "collapsed";
export type DashboardLayout = "standard" | "analysis" | "compact" | "immersive";

export const DASHBOARD_MODULES = [
  "market-pulse",
  "major-markets",
  "alternative-assets",
  "sectors",
  "observatory",
  "risk-command",
  "market-status",
  "popular-assets",
  "popular-stocks",
  "daily-movers",
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULES)[number];

export const DASHBOARD_MODULE_LABELS: Record<DashboardModuleId, string> = {
  "market-pulse": "Market Pulse",
  "major-markets": "Marchés majeurs",
  "alternative-assets": "Actifs alternatifs",
  sectors: "Performance des secteurs",
  observatory: "Observatoire",
  "risk-command": "Command Center",
  "market-status": "Statut des marchés",
  "popular-assets": "Actifs populaires",
  "popular-stocks": "Actions populaires",
  "daily-movers": "Mouvements du jour",
};

export interface UserPreferences {
  theme: ThemePreference;
  density: DensityPreference;
  dashboardLayout: DashboardLayout;
  dashboardOrder: DashboardModuleId[];
  dashboardVisibility: Record<DashboardModuleId, boolean>;
  animations: AnimationPreference;
  cursor: {
    enabled: boolean;
    intensity: CursorIntensity;
    halo: boolean;
    reticle: boolean;
    hover: boolean;
    click: boolean;
  };
  sidebar: {
    mode: SidebarMode;
    labels: boolean;
  };
  dataDisplay: {
    compactValues: boolean;
    showSymbols: boolean;
    showUnits: boolean;
    showTimestamps: boolean;
  };
  immersive: {
    observatoryAuto: boolean;
  };
  accessibility: {
    highContrast: boolean;
    focusRings: boolean;
  };
  privacy: boolean;
  sound: boolean;
}

export type PreferencePatch = Partial<Omit<UserPreferences, "cursor" | "sidebar" | "dataDisplay" | "immersive" | "accessibility">> & {
  cursor?: Partial<UserPreferences["cursor"]>;
  sidebar?: Partial<UserPreferences["sidebar"]>;
  dataDisplay?: Partial<UserPreferences["dataDisplay"]>;
  immersive?: Partial<UserPreferences["immersive"]>;
  accessibility?: Partial<UserPreferences["accessibility"]>;
};

const PREFERENCES_KEY = "soliris-user-preferences";

const dashboardVisibility = Object.fromEntries(
  DASHBOARD_MODULES.map((id) => [id, true]),
) as Record<DashboardModuleId, boolean>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: "dark",
  density: "standard",
  dashboardLayout: "standard",
  dashboardOrder: [...DASHBOARD_MODULES],
  dashboardVisibility,
  animations: "full",
  cursor: {
    enabled: true,
    intensity: "standard",
    halo: true,
    reticle: true,
    hover: true,
    click: true,
  },
  sidebar: {
    mode: "auto",
    labels: true,
  },
  dataDisplay: {
    compactValues: false,
    showSymbols: true,
    showUnits: true,
    showTimestamps: true,
  },
  immersive: {
    observatoryAuto: false,
  },
  accessibility: {
    highContrast: false,
    focusRings: true,
  },
  privacy: false,
  sound: true,
};

function isDashboardModuleId(value: unknown): value is DashboardModuleId {
  return typeof value === "string" && (DASHBOARD_MODULES as readonly string[]).includes(value);
}

function readStoredPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_USER_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<UserPreferences>) : {};
    const legacyTheme = window.localStorage.getItem("theme");
    const legacyPrivacy = window.localStorage.getItem("privacy");
    const legacySound = window.localStorage.getItem("soliris-sound-enabled");
    const storedOrder = Array.isArray(stored.dashboardOrder)
      ? stored.dashboardOrder.filter(isDashboardModuleId)
      : [];
    const order = [...storedOrder, ...DASHBOARD_MODULES.filter((id) => !storedOrder.includes(id))];

    return {
      ...DEFAULT_USER_PREFERENCES,
      ...stored,
      theme: stored.theme ?? (legacyTheme === "light" ? "light" : DEFAULT_USER_PREFERENCES.theme),
      privacy: stored.privacy ?? legacyPrivacy === "on",
      sound: stored.sound ?? legacySound !== "false",
      dashboardOrder: order,
      dashboardVisibility: {
        ...DEFAULT_USER_PREFERENCES.dashboardVisibility,
        ...(stored.dashboardVisibility ?? {}),
      },
      cursor: { ...DEFAULT_USER_PREFERENCES.cursor, ...(stored.cursor ?? {}) },
      sidebar: { ...DEFAULT_USER_PREFERENCES.sidebar, ...(stored.sidebar ?? {}) },
      dataDisplay: { ...DEFAULT_USER_PREFERENCES.dataDisplay, ...(stored.dataDisplay ?? {}) },
      immersive: { ...DEFAULT_USER_PREFERENCES.immersive, ...(stored.immersive ?? {}) },
      accessibility: { ...DEFAULT_USER_PREFERENCES.accessibility, ...(stored.accessibility ?? {}) },
    };
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

function applyPreferencesToDocument(preferences: UserPreferences, systemReducedMotion: boolean) {
  if (typeof document === "undefined") return;

  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  const dark = preferences.theme === "dark" || (preferences.theme === "system" && systemDark);
  const fullMotion = preferences.animations === "full" && !systemReducedMotion;

  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("privacy", preferences.privacy);
  document.documentElement.classList.toggle("high-contrast", preferences.accessibility.highContrast);
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.density = preferences.density;
  document.documentElement.dataset.animationLevel = preferences.animations;
  document.documentElement.dataset.motion = fullMotion ? "full" : "system";
  document.documentElement.dataset.sidebar = preferences.sidebar.mode;
  document.documentElement.dataset.cursorIntensity = preferences.cursor.intensity;
  document.documentElement.dataset.cursorDisabled = preferences.cursor.enabled ? "false" : "true";
}

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  systemReducedMotion: boolean;
  updatePreferences: (patch: PreferencePatch) => void;
  setDashboardModuleVisibility: (id: DashboardModuleId, visible: boolean) => void;
  moveDashboardModule: (id: DashboardModuleId, beforeId: DashboardModuleId) => void;
  resetPreferences: () => void;
  isDashboardModuleVisible: (id: DashboardModuleId) => boolean;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(readStoredPreferences);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // The preference remains active for the current session if storage is unavailable.
    }
  }, [preferences]);

  useEffect(() => {
    applyPreferencesToDocument(preferences, systemReducedMotion);
  }, [preferences, systemReducedMotion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setSystemReducedMotion(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const updatePreferences = useCallback((patch: PreferencePatch) => {
    setPreferences((current) => ({
      ...current,
      ...patch,
      cursor: { ...current.cursor, ...(patch.cursor ?? {}) },
      sidebar: { ...current.sidebar, ...(patch.sidebar ?? {}) },
      dataDisplay: { ...current.dataDisplay, ...(patch.dataDisplay ?? {}) },
      immersive: { ...current.immersive, ...(patch.immersive ?? {}) },
      accessibility: { ...current.accessibility, ...(patch.accessibility ?? {}) },
    }));
  }, []);

  const setDashboardModuleVisibility = useCallback((id: DashboardModuleId, visible: boolean) => {
    setPreferences((current) => ({
      ...current,
      dashboardVisibility: { ...current.dashboardVisibility, [id]: visible },
    }));
  }, []);

  const moveDashboardModule = useCallback((id: DashboardModuleId, beforeId: DashboardModuleId) => {
    setPreferences((current) => {
      if (id === beforeId) return current;
      const next = current.dashboardOrder.filter((moduleId) => moduleId !== id);
      const targetIndex = next.indexOf(beforeId);
      next.splice(targetIndex === -1 ? next.length : targetIndex, 0, id);
      return { ...current, dashboardOrder: next };
    });
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences({
      ...DEFAULT_USER_PREFERENCES,
      dashboardOrder: [...DASHBOARD_MODULES],
      dashboardVisibility: { ...DEFAULT_USER_PREFERENCES.dashboardVisibility },
      cursor: { ...DEFAULT_USER_PREFERENCES.cursor },
      sidebar: { ...DEFAULT_USER_PREFERENCES.sidebar },
      dataDisplay: { ...DEFAULT_USER_PREFERENCES.dataDisplay },
      immersive: { ...DEFAULT_USER_PREFERENCES.immersive },
      accessibility: { ...DEFAULT_USER_PREFERENCES.accessibility },
    });
  }, []);

  const value = useMemo<UserPreferencesContextValue>(() => ({
    preferences,
    systemReducedMotion,
    updatePreferences,
    setDashboardModuleVisibility,
    moveDashboardModule,
    resetPreferences,
    isDashboardModuleVisible: (id) => preferences.dashboardVisibility[id],
  }), [
    preferences,
    systemReducedMotion,
    updatePreferences,
    setDashboardModuleVisibility,
    moveDashboardModule,
    resetPreferences,
  ]);

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (!context) throw new Error("useUserPreferences must be used within UserPreferencesProvider");
  return context;
}