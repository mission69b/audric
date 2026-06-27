"use client";

import { useEffect } from "react";

/**
 * Forces the LIGHT theme for the subtree's lifetime by removing the `dark` class
 * from <html> (which is what the `@custom-variant dark (.dark, .dark *)` token
 * overrides key off). A nested next-themes ThemeProvider can't do this — the root
 * provider owns the <html> class — so we set it directly and restore on unmount.
 * Used by the checkout (Stripe's embedded UI has fixed light chrome).
 */
export function ForceLightTheme() {
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    html.classList.remove("dark");
    html.classList.add("light");
    return () => {
      html.classList.remove("light");
      if (wasDark) {
        html.classList.add("dark");
      }
    };
  }, []);

  return null;
}
