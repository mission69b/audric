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
 * Custom event name fired by `authFetch` when the server returns HTTP
 * 401. `useZkLogin` listens for this and immediately flips status to
 * `'expired'`, which `AuthGuard` reads to redirect to `/` for re-login.
 *
 * Why an event (not a direct setState):
 *   - `authFetch` is a plain function used from canvas components, hooks,
 *     and one-off fetches across the app — it has no React-context handle
 *     to call setState on.
 *   - `useZkLogin` is the canonical owner of session lifecycle state.
 *     A `window`-scoped CustomEvent keeps the producer/consumer decoupled
 *     and lets multiple `useZkLogin` instances (rare, but defensible)
 *     hear the same signal.
 *
 * Why we still need this even though `useZkLogin` polls every 60s:
 *   - The 60s poll uses the JWT's `exp` claim (client-side decode). It
 *     misses two real cases:
 *       a) Clock skew — server's `jose.jwtVerify` is stricter than the
 *          client's 60s tolerance, so a JWT can be "valid" client-side
 *          but rejected by the server.
 *       b) Race — canvas fetches that fire in the 60s window between
 *          actual expiry and the next poll tick will 401 silently
 *          without expiring the session.
 *   - Server-confirmed 401 is the authoritative signal that the session
 *     can no longer authenticate. Reacting to it immediately is the only
 *     race-free way to keep client state in sync with server reality.
 */
export const ZKLOGIN_EXPIRED_EVENT = 'zklogin:expired';

export interface ZkLoginExpiredDetail {
  /** URL of the request that returned 401 (helpful for telemetry / debug). */
  url: string;
}

/**
 * Drop-in replacement for `fetch` that automatically attaches the
 * caller's zkLogin JWT (`x-zklogin-jwt` header). Same signature as the
 * native `fetch`. Use this for ANY API request that targets a route
 * gated by `authenticateRequest` / `assertOwns` / `assertOwnsOrWatched`.
 *
 * Detects HTTP 401 responses (server says "JWT invalid / expired") and
 * fires a `'zklogin:expired'` window event so `useZkLogin` can flip
 * status to `'expired'` and `AuthGuard` can redirect to re-login. This
 * runs side-by-side with the original promise — callers receive the
 * unchanged `Response` and can still handle 401 themselves if they want.
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
  const promise = fetch(input, { ...init, headers });

  // Fire-and-forget 401 detector. We attach to a `.then` that runs in
  // parallel with whatever the caller does with the promise — the
  // caller still receives the original `Response` reference. Network
  // errors are intentionally swallowed (a thrown fetch is NOT an auth
  // failure; let the caller's `.catch` handle them as before).
  if (typeof window !== 'undefined') {
    promise.then(
      (res) => {
        if (res.status === 401) {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
          window.dispatchEvent(
            new CustomEvent<ZkLoginExpiredDetail>(ZKLOGIN_EXPIRED_EVENT, {
              detail: { url },
            }),
          );
        }
      },
      () => {
        /* network error — irrelevant for expiry detection */
      },
    );
  }

  return promise;
}
