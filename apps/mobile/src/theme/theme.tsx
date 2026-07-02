import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "./tokens";

// Light & dark "stay in sync" in the prototype (it renders both phones at once);
// on a device we resolve one scheme at runtime. Default = follow the OS, with a
// manual override the user can flip (the `/theme` slash command + a settings
// toggle later). No persistence — the prototype itself doesn't persist, and the
// OS default is the right cold-start behaviour.
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
  const [override, setOverride] = useState<Override>("system");

  const scheme: Scheme =
    override === "system" ? (system === "light" ? "light" : "dark") : override;
  const isDark = scheme === "dark";

  const toggle = useCallback(() => {
    setOverride(scheme === "dark" ? "light" : "dark");
  }, [scheme]);

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
