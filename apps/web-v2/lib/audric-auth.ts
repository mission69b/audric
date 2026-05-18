/**
 * audric-auth (server) — thin adapter that replaces next-auth's server
 * surface for the v0.7c fork.
 *
 * Companion file: `lib/audric-auth-client.ts` (carries `'use client'`).
 *
 * --- WHY THIS FILE EXISTS (BENEFITS_SPEC v0.7c Phase 1 Day 1c, 2026-05-18) ---
 *
 * The vendored vercel/ai-chatbot template (`107a43a`) used next-auth for
 * server-side `auth()` calls (route handlers + server actions + server
 * layouts). Audric does NOT use next-auth — it uses zkLogin, where
 * identity is established CLIENT-SIDE (Google OIDC id_token → Enoki →
 * Sui address, blob stored in `localStorage`) and reaches the server as
 * the `x-zklogin-jwt` header verified per-request via `jose` (see
 * `apps/web/lib/auth.ts`, `apps/web/middleware.ts`).
 *
 * Audric has NO cookie-based session and NO httpOnly session. Server
 * Components do NOT have a "current user" context the way next-auth
 * provides; the dashboard is gated CLIENT-SIDE by `AuthGuard` +
 * `useZkLogin()`. This adapter mirrors that architectural choice in
 * web-v2.
 *
 * --- DAY 1c SCOPE ---
 *
 * What this file delivers TODAY (Day 1c):
 *  - **Types**: `AudricUserType`, `AudricSessionUser`, `AudricSession` —
 *    drop-in shape replacement for next-auth's `Session` / `User`.
 *  - **Server stub**: `getCurrentUser()` — reads `x-zklogin-jwt` from
 *    `headers()` and decodes the JWT payload to surface `sub` / `email`.
 *    DOES NOT YET verify the JWT signature (Phase 2 wires the real
 *    `jose.jwtVerify` + Google JWKS path from `apps/web/lib/auth.ts`).
 *    Returns `null` when no JWT header is present.
 *
 * What this file DOES NOT do (deferred to Phase 2):
 *  - JWT signature verification (currently decode-only — SAFE because
 *    no Day 1c route is wired into a production audric backend; the
 *    moment a real handler accepts authenticated input, Phase 2's
 *    `verifyJwt()` must replace the decode).
 *  - Enoki address derivation (currently uses the JWT `sub` directly,
 *    NOT the canonical Sui address). Phase 2 wires `deriveAddressFromEnoki`.
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 1 Day 1c" + audric-build-tracker.md row 7t.
 * D-7 (b) "vendor-first, then strip" + D-15 ("audric-side composition layer").
 */

import { decodeJwt } from 'jose';

// -----------------------------------------------------------------------------
// Types (drop-in shape replacement for next-auth Session / User)
// -----------------------------------------------------------------------------

/**
 * `'guest'` = no valid zkLogin session attached (anonymous / demo path).
 * `'regular'` = JWT verified, Sui address derived, real user.
 */
export type AudricUserType = 'guest' | 'regular';

/**
 * Drop-in shape for the template's `Session.user`. The template's `id`
 * field was a Drizzle User-table primary key; here `id` is the Sui
 * address (canonical audric product identity per `apps/web/lib/auth.ts`).
 */
export interface AudricSessionUser {
  /**
   * Sui address (zkLogin-derived) for `type: 'regular'`.
   * For `type: 'guest'`, a stable synthetic id (`guest:<jwt.sub>`) so
   * Drizzle FKs don't collapse onto the same row.
   */
  id: string;
  email: string | null;
  type: AudricUserType;
}

export interface AudricSession {
  user: AudricSessionUser;
}

// -----------------------------------------------------------------------------
// Server: getCurrentUser() — replaces next-auth's `await auth()`
// -----------------------------------------------------------------------------

/**
 * Server-side current-user resolver. Mirrors the audric/web pattern:
 * read `x-zklogin-jwt` from the incoming request headers and decode the
 * JWT payload to surface identity.
 *
 * DAY 1c IS DECODE-ONLY: no signature verification, no Enoki address
 * derivation. PHASE 2 replaces with the verified path from
 * `apps/web/lib/auth.ts` (jose + Google JWKS + Enoki).
 *
 * Returns `null` when the header is absent → template's route handlers
 * surface 401 (`ChatbotError("unauthorized:chat").toResponse()`); the
 * sidebar layout renders the "Login to save and revisit previous chats"
 * empty state.
 */
export async function getCurrentUser(): Promise<AudricSession | null> {
  // [Next 15+ / App Router] `headers()` works in Server Components, Route
  // Handlers, and Server Actions. Dynamic import keeps the bundle graph
  // honest — this module is consumed from both server and client code.
  const { headers } = await import('next/headers');
  const headerList = await headers();
  const jwt = headerList.get('x-zklogin-jwt');

  if (!jwt) return null;

  try {
    const payload = decodeJwt(jwt);
    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    if (!sub) return null;

    const email = typeof payload.email === 'string' ? payload.email : null;

    return {
      user: {
        // Day 1c: use `sub` as a placeholder id. Phase 2 swaps to the
        // Enoki-derived Sui address (the canonical audric identity).
        id: sub,
        email,
        type: 'regular',
      },
    };
  } catch {
    return null;
  }
}
