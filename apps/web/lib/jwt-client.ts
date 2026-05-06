// Client-safe JWT claim reader. Parses the payload segment with
// `atob`, NOT `Buffer.from` — `lib/auth.ts` uses Buffer (server-only),
// so client components cannot import that file. This file is the
// canonical client-side replacement for the email/name claim reads
// the chrome surfaces need.
//
// Used by:
//   - components/shell/AppSidebar.tsx           (sidebar footer email)
//   - components/settings/PassportSection.tsx   (Settings → Sign-in email row)
//   - app/new/dashboard-content.tsx             (greeting + picker pre-fill)
//
// No signature verification — these surfaces only need the human-readable
// identifier (email / name); they don't gate behavior on it. Routes that
// gate behavior on JWT claims must use `validateJwt` from `lib/auth.ts`
// (server-side) which performs proper expiry + structure validation.

export type JwtClaim = 'email' | 'name';

export function decodeJwtClaim(
  jwt: string | null | undefined,
  claim: JwtClaim,
): string | null {
  if (!jwt) return null;
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const value = decoded[claim];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}
