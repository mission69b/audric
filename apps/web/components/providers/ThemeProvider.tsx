'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { isPublicPath } from '@/lib/theme/public-paths';

/**
 * Runtime theme controller.
 *
 * Pre-paint, the inline script in `app/layout.tsx` (see
 * `lib/theme/script.ts`) reads localStorage + the current pathname
 * and stamps `data-theme="dark"` on `<html>` if appropriate. This
 * provider takes over from there, handling:
 *
 *   - User-driven theme changes via `setTheme(...)` from the toggle
 *     UI (settings + sidebar footer in Phases 4 & 5).
 *   - Live system-pref tracking when `theme === 'system'`. If the OS
 *     flips dark/light mid-session, the resolved theme follows.
 *   - Cross-tab sync via the `storage` event — change theme in one
 *     tab and other open tabs update.
 *   - Route-aware attribute application. Navigating from a themed
 *     route to a public route (e.g. /settings → /) strips the
 *     `data-theme` attribute; the reverse re-applies it.
 *
 * Components consume the theme through CSS vars (semantic Tailwind
 * tokens like `bg-surface-card`), not through `useTheme()`. The hook
 * exists for the toggle controls and any future component that
 * genuinely needs to branch on the resolved value (e.g. swapping a
 * sun icon for a moon icon).
 */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** User's choice. `'system'` is a real value, not pre-resolved. */
  theme: Theme;
  /** What's actually applied to <html> right now. Always 'light' or 'dark'. */
  resolvedTheme: ResolvedTheme;
  /** Update the choice. Persisted to localStorage and applied immediately. */
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'audric-theme';

function getSystemPref(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* private browsing — fall through */
  }
  return 'system';
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [systemPref, setSystemPref] = useState<ResolvedTheme>(() => getSystemPref());

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemPref : theme;

  // Track OS-level color-scheme changes so `theme === 'system'` stays live.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemPref(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Cross-tab sync — fires when another tab writes localStorage.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setThemeState(readStoredTheme());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Apply `data-theme` to <html>. Public routes strip it unconditionally
  // so marketing / legal / public pay always render light.
  useEffect(() => {
    const html = document.documentElement;
    if (isPublicPath(pathname)) {
      html.removeAttribute('data-theme');
      return;
    }
    if (resolvedTheme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
    }
  }, [resolvedTheme, pathname]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private browsing — choice still applies for this tab via state */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
