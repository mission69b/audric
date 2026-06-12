/**
 * Node resolve hooks for running app code as a standalone script
 * (`scripts/audit-defi-removal.mts`). Handles what Next/tsconfig
 * normally do at build time:
 *  - `@/…` path alias → apps/web-v2 root
 *  - extensionless TS imports (`./env` → `./env.ts`)
 *
 * Registered via `scripts/audit-register.mjs` (--import).
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APP_ROOT = new URL("../", import.meta.url);

function tryCandidates(base) {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = new URL(base.href + suffix);
    try {
      if (existsSync(fileURLToPath(candidate))) {
        return candidate.href;
      }
    } catch {
      // non-file URL — skip
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const hit = tryCandidates(new URL(specifier.slice(2), APP_ROOT));
    if (hit) {
      return next(hit, context);
    }
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    try {
      return await next(specifier, context);
    } catch (error) {
      const hit = tryCandidates(new URL(specifier, context.parentURL));
      if (hit) {
        return next(hit, context);
      }
      throw error;
    }
  }
  return next(specifier, context);
}
