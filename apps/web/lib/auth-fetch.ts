/**
 * # `authFetch` — centralised JWT-bearing fetch helper
 *
 * SPEC 30 Phase 1A.5 (closing the unauthenticated-read class).
 *
 * Pre-Phase-1A.5 every dashboard canvas and hook called bare `fetch()`
 * against routes like `/api/portfolio?address=...`, with no JWT
 * header. The middleware was permissive (passed JWT-less requests
 * through) and route handlers had no auth gate at all — anyone could
 * read anyone's analytics. Phase 1A.5's structural fix is two-sided:
 *
 *   1. Route handlers call `authenticateRequest` + `assertOwnsOrWatched`
 *      so JWT is now mandatory and `?address=` must resolve to the
 *      caller (or one of their watched addresses).
 *   2. Client fetch sites use this `authFetch` wrapper so the
 *      `x-zklogin-jwt` header is added uniformly. No fetch site
 *      needs to know about the session-store key, the header name,
 *      or the missing-session edge case.
 *
 * ## Behaviour
 *
 * - Reads the zkLogin session JWT from localStorage on every call.
 * - If a session exists with a non-empty JWT, attaches it as the
 *   `x-zklogin-jwt` header alongside any caller-supplied headers.
 * - If NO session exists (logged-out user / SSR pre-mount), the
 *   request is sent without the header. Route handlers will then
 *   return HTTP 401, which is the correct behaviour — a logged-out
 *   client should never have been making the request.
 *
 * ## Why not import `loadSession` from zklogin.ts?
 *
 * Importing `lib/zklogin.ts` here would transitively pull
 * `lib/constants.ts` (and its `env` read) into every canvas / hook
 * import graph that uses `authFetch`. That breaks tests which mock
 * `@/lib/env` because the mock factory runs before the test file's
 * top-level `const mockEnv = {...}` is initialised. We read the
 * storage key directly to keep `auth-fetch.ts` zero-dependency at
 * module-eval time.
 *
 * The storage key MUST stay in sync with `lib/zklogin.ts`'s
 * `STORAGE_KEY`. There's a regression test in `auth-fetch.test.ts`
 * that asserts the two are identical.
 */

const STORAGE_KEY = 't2000:zklogin:session';

interface MinimalSession {
  jwt?: string;
}

function readSessionJwt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MinimalSession;
    if (typeof parsed.jwt === 'string' && parsed.jwt.length > 0) return parsed.jwt;
    return null;
  } catch {
    return null;
  }
}

/**
 * Drop-in replacement for `fetch` that automatically attaches the
 * caller's zkLogin JWT (`x-zklogin-jwt` header). Same signature as the
 * native `fetch`. Use this for ANY API request that targets a route
 * gated by `authenticateRequest` / `assertOwns` / `assertOwnsOrWatched`.
 *
 * Example:
 * ```ts
 * const res = await authFetch(`/api/portfolio?address=${address}`);
 * const data = await res.json();
 * ```
 */
export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const jwt = readSessionJwt();
  const headers = new Headers(init?.headers ?? {});
  if (jwt && !headers.has('x-zklogin-jwt')) {
    headers.set('x-zklogin-jwt', jwt);
  }
  return fetch(input, { ...init, headers });
}
