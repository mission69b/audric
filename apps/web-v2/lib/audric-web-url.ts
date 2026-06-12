/**
 * Cross-app fetch URL helper.
 *
 * Settings + future v2 surfaces hit apps/web's API routes (`/api/user/*`,
 * `/api/identity/*`, etc.) until those routes migrate in v0.7e (Tier C
 * copy-port per audit-3). Post-cutover the audric.ai domain serves both
 * apps via Vercel rewrites, so same-origin fetches work. Pre-cutover
 * preview testing (when web-v2 lives at audric-web-v2.vercel.app and
 * apps/web at audric.ai) needs explicit cross-origin URLs.
 *
 * Strategy:
 *   - `NEXT_PUBLIC_AUDRIC_WEB_URL` set → prefix all cross-app paths with it
 *   - Not set → return path as-is (same-origin; works post-cutover)
 *
 * Used by:
 *   - `hooks/use-user-status.ts`
 *   - `lib/swr/user-preferences.ts` (reads/writes preferences)
 *   - `components/settings/username-change-modal.tsx` (identity APIs)
 */

import { env } from "./env";

const AUDRIC_WEB_URL = (env.NEXT_PUBLIC_AUDRIC_WEB_URL ?? "").replace(
  /\/+$/,
  ""
);

export function audricWebUrl(path: string): string {
  if (!AUDRIC_WEB_URL) {
    return path;
  }
  if (!path.startsWith("/")) {
    return `${AUDRIC_WEB_URL}/${path}`;
  }
  return `${AUDRIC_WEB_URL}${path}`;
}
