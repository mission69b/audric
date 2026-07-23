import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import { loadThemeOverride, saveThemeOverride } from "@/lib/prefs";
import { darkColors, lightColors, type ThemeColors } from "./tokens";

// Light & dark "stay in sync" in the prototype (it renders both phones at once);
// on a device we resolve one scheme at runtime. Default = follow the OS, with a
// manual override the user can flip (the `/theme` slash command + a settings
// toggle). The override is PERSISTED (SecureStore, via `lib/prefs`) so a chosen
// scheme survives a cold restart instead of snapping back to the OS default.
type Scheme = "light" | "dark";
type Override = Scheme | "system";

type ThemeState = {
  colors: ThemeColors;
  scheme: Scheme;
  isDark: boolean;
  /** null = following the OS; otherwise the pinned scheme. */
  override: Override;
  setOverride: (o: Override) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [override, setOverrideState] = useState<Override>("system");

  // Load the persisted override once on mount. Until the async read resolves we
  // follow the OS ("system"), so the first paint is the sensible default and then
  // snaps to the pinned scheme if the user had chosen one.
  useEffect(() => {
    let alive = true;
    loadThemeOverride().then((o) => {
      if (alive) setOverrideState(o);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Every override change persists so it survives a cold restart.
  const setOverride = useCallback((o: Override) => {
    setOverrideState(o);
    void saveThemeOverride(o);
  }, []);

  const scheme: Scheme =
    override === "system" ? (system === "light" ? "light" : "dark") : override;
  const isDark = scheme === "dark";

  const toggle = useCallback(() => {
    setOverride(scheme === "dark" ? "light" : "dark");
  }, [scheme, setOverride]);

  const value = useMemo<ThemeState>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      scheme,
      isDark,
      override,
      setOverride,
      toggle,
    }),
    [isDark, scheme, override, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}
