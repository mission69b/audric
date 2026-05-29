/**
 * check-ads-tokens — regression guard for the R6.9 ADS decommission.
 *
 * The legacy Agentic Design System (ADS) was fully removed from
 * audric/web-v2 in R6.9 (2026-05-30): the raw colour ramps (the
 * --n, --r, --g, --y, --o, --b families) and the surface- / fg- /
 * border-default|subtle|focus / status -fg|-bg|-border|-solid
 * semantic aliases are gone. Every surface now reads the shadcn
 * tokens (--background, --foreground, --card, --muted, --border,
 * --success, --warning, --info, --destructive, --signal).
 *
 * This script fails CI if any ADS token (utility class OR raw CSS var)
 * is reintroduced. Run: `pnpm --filter @audric/web-v2 check:ads`.
 *
 * NOT banned (legitimate Geist / shadcn tokens):
 *   - bare status utilities: text-success, bg-warning, text-info,
 *     text-destructive (only the -fg/-bg/-border/-solid SUFFIXED ADS
 *     variants are banned)
 *   - border-strong (Geist token), --fg / --bg / --fg-muted (Geist),
 *     --signal / --signal-bg, --bubble-user-*, --chart-*, --ds-*
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const SCAN_EXT = new Set([".ts", ".tsx", ".css", ".mts"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".turbo"]);
const SELF = "check-ads-tokens";

// ADS Tailwind utility classes (surface / fg / border / suffixed status).
const ADS_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|decoration|outline|divide|placeholder|caret|accent|shadow|hover:bg|hover:text|hover:border|focus:border|focus-visible:border)-(?:surface-(?:page|card|sunken|elevated|inverse)|fg-(?:primary|secondary|muted|disabled|inverse)|border-(?:default|subtle|focus)|(?:success|warning|error|info)-(?:fg|bg|border|solid))\b/;

// Raw ADS CSS custom properties. `fg-muted` is intentionally excluded —
// Geist owns `--fg-muted`, so a raw `var(--fg-muted)` is legitimate.
const ADS_VAR =
  /var\(--(?:n[1-9]00|r[1-8]00|g[1-8]00|y[1-8]00|o[45]00|b[1-8]00|surface-(?:page|card|sunken|elevated|inverse)|fg-(?:primary|secondary|disabled|inverse)|border-(?:default|subtle|focus)|(?:success|warning|error|info)-(?:fg|bg|border|solid))\)/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      yield* walk(join(dir, entry.name));
    } else if (
      SCAN_EXT.has(entry.name.slice(entry.name.lastIndexOf(".")) ?? "") &&
      !entry.name.includes(SELF)
    ) {
      yield join(dir, entry.name);
    }
  }
}

const violations: string[] = [];

for (const scanDir of SCAN_DIRS) {
  const abs = join(ROOT, scanDir);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const classHit = line.match(ADS_CLASS);
      const varHit = line.match(ADS_VAR);
      const hit = classHit ?? varHit;
      if (hit) {
        violations.push(`${relative(ROOT, file)}:${i + 1}  →  ${hit[0]}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    `\n❌ ADS token reintroduction detected (${violations.length}):\n`
  );
  for (const v of violations) {
    console.error(`   ${v}`);
  }
  console.error(
    "\nThe Agentic Design System was decommissioned in R6.9. Use the" +
      "\nGeist-rooted shadcn tokens instead (text-foreground, bg-muted," +
      "\ntext-muted-foreground, border-border, text-success, text-warning," +
      "\ntext-info, text-destructive, text-signal). See app/globals.css.\n"
  );
  process.exit(1);
}

console.log("✓ No ADS tokens — Geist DS is the single source of truth.");
