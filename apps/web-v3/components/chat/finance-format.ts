/** Shared display formatting for the finance cards (chat) + Markets page.
 * Display-only — never feeds back into transaction amounts (those follow the
 * floor-not-round rule in the SDK paths; these are read-only market numbers). */

/** $1.2T / $845.3B / $33.5M / $1,234 — compact USD for caps + volumes. */
export function fmtUsdCompact(n?: number | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return "—";
  }
  const abs = Math.abs(n);
  if (abs >= 1e12) {
    return `$${(n / 1e12).toFixed(2)}T`;
  }
  if (abs >= 1e9) {
    return `$${(n / 1e9).toFixed(1)}B`;
  }
  if (abs >= 1e6) {
    return `$${(n / 1e6).toFixed(1)}M`;
  }
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Price with sensible precision: $59,922.53 · $2.4818 · $0.000012. */
export function fmtPrice(n?: number | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return "—";
  }
  if (n >= 1000) {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  }
  if (n >= 1) {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  }
  if (n >= 0.01) {
    return `$${n.toFixed(4)}`;
  }
  return `$${n.toPrecision(3)}`;
}

/** +1.72% / −2.31% (with the sign baked in). */
export function fmtPct(n?: number | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return "—";
  }
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** Tailwind color class for a signed change. */
export function pctColor(n?: number | null): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) {
    return "text-muted-foreground";
  }
  return n > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}
