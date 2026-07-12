// Audric mobile design tokens — a faithful port of the mobile prototype
// (`Audric Mobile Design Brief/Audric Mobile.dc.html`). The prototype drives the
// UI from CSS custom properties (`--bg`, `--card`, `--teal`, …) with a light and
// a dark set; React Native has neither CSS vars nor `oklch()`, so the two sets
// are flattened to hex here (grayscale oklch(L 0 0) converted per sRGB) and
// selected at runtime by the ThemeProvider. Var names are preserved 1:1
// (`--muted-fg` → `mutedFg`) so mapping a prototype style to RN stays mechanical.

export type ThemeColors = {
  bg: string;
  card: string;
  fg: string;
  muted: string;
  mutedFg: string;
  border: string;
  secondary: string;
  secondaryFg: string;
  /** signal accent — the Audric cyan/teal (`--teal`, prototype prop `accent`) */
  teal: string;
  tealLabel: string;
  tealBg: string;
  /** privacy green (`--priv`) — the shield / "non-custodial" chips */
  priv: string;
  privBg: string;
  /** message bubble gradient stops (`--bubble`) */
  bubbleFrom: string;
  bubbleTo: string;
  /** modal backdrop (`--scrim`) */
  scrim: string;
  sheet: string;
  statusFg: string;
  /** amber warning (over-balance send, "can't see images") */
  warn: string;
  warnFg: string;
  /** destructive red (delete / purge / sign out) */
  danger: string;
};

// The prototype accent (`props.accent` default). Shared by both themes.
const TEAL = "#0ac7b4";

export const lightColors: ThemeColors = {
  bg: "#fafafa", // oklch(0.985 0 0)
  card: "#ffffff", // oklch(1 0 0)
  fg: "#060606", // oklch(0.12 0 0)
  muted: "#ebebeb", // oklch(0.94 0 0)
  mutedFg: "#7a7a7a", // oklch(0.58 0 0)
  border: "#dedede", // oklch(0.9 0 0)
  secondary: "#f3f3f3", // oklch(0.965 0 0)
  secondaryFg: "#424242", // oklch(0.38 0 0)
  teal: TEAL,
  tealLabel: "#0a9486",
  tealBg: "rgba(10,148,134,0.10)",
  priv: "#047857",
  privBg: "rgba(5,150,105,0.12)",
  bubbleFrom: "#f3f3f3", // oklch(0.965 0 0)
  bubbleTo: "#e8e8e8", // oklch(0.93 0 0)
  scrim: "rgba(0,0,0,0.32)",
  sheet: "#ffffff",
  statusFg: "#060606",
  warn: "#d97706",
  warnFg: "#b45309",
  danger: "#dc2626",
};

export const darkColors: ThemeColors = {
  bg: "#151515", // oklch(0.195 0 0)
  card: "#1c1c1c", // oklch(0.225 0 0)
  fg: "#ebebeb", // oklch(0.94 0 0)
  muted: "#242424", // oklch(0.26 0 0)
  mutedFg: "#808080", // oklch(0.6 0 0)
  border: "#262626", // oklch(0.27 0 0)
  secondary: "#242424", // oklch(0.26 0 0)
  secondaryFg: "#aeaeae", // oklch(0.75 0 0)
  teal: TEAL,
  tealLabel: "#2dd4bf",
  tealBg: "rgba(45,212,191,0.13)",
  priv: "#34d399",
  privBg: "rgba(16,185,129,0.14)",
  bubbleFrom: "#2e2e2e", // oklch(0.30 0 0)
  bubbleTo: "#202020", // oklch(0.245 0 0)
  scrim: "rgba(0,0,0,0.52)",
  sheet: "#1c1c1c",
  statusFg: "#ebebeb",
  warn: "#d97706",
  warnFg: "#fbbf24",
  danger: "#ef4444",
};

// Geist / Geist Mono — the web-v3 typeface. Loaded in the root layout via
// @expo-google-fonts/geist; these are the family names expo-font registers.
export const fonts = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
  monoSemibold: "GeistMono_600SemiBold",
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;
