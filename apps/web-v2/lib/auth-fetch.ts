/**
 * `authFetch` — centralised JWT-bearing fetch helper.
 *
 * Ported verbatim from `apps/web/lib/auth-fetch.ts` during Phase 5b
 * (canvas templates). zkLogin storage key is identical across both
 * apps (`t2000:zklogin:session` — verified in
 * `apps/web-v2/lib/zklogin.ts` line 43).
 *
 * Five of the eight canvas templates (`WatchAddressCanvas`,
 * `ActivityHeatmapCanvas`, `PortfolioTimelineCanvas`,
 * `SpendingBreakdownCanvas`, `FullPortfolioCanvas`) hit audric API
 * routes like `/api/portfolio?address=...` to fetch live data on
 * mount. They MUST send the user's zkLogin JWT or the route handlers'
 * `authenticateRequest` + `assertOwnsOrWatched` gates will 401 them.
 *
 * NOTE: the API routes those canvases hit aren't all ported to
 * web-v2 yet (Phase 6 cutover scope). Until then, canvases that hit
 * unported routes will surface a 401 / 404 and render their loading
 * state indefinitely. Phase 5b is RENDERER parity; data-route parity
 * is Phase 6.
 */

const STORAGE_KEY = "t2000:zklogin:session";

interface MinimalSession {
  jwt?: string;
}

function readSessionJwt(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as MinimalSession;
    if (typeof parsed.jwt === "string" && parsed.jwt.length > 0) {
      return parsed.jwt;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Custom event name fired by `authFetch` when the server returns HTTP
 * 401. `useZkLogin` listens for this to immediately flip status to
 * `'expired'`. See legacy doc in `apps/web/lib/auth-fetch.ts` for the
 * full rationale (clock-skew + 60s-poll race conditions).
 */
export const ZKLOGIN_EXPIRED_EVENT = "zklogin:expired";

export interface ZkLoginExpiredDetail {
  url: string;
}

/**
 * Drop-in replacement for `fetch` that automatically attaches the
 * caller's zkLogin JWT (`x-zklogin-jwt` header). Detects HTTP 401
 * responses and fires a `'zklogin:expired'` window event for re-login
 * orchestration.
 */
export function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const jwt = readSessionJwt();
  const headers = new Headers(init?.headers ?? {});
  if (jwt && !headers.has("x-zklogin-jwt")) {
    headers.set("x-zklogin-jwt", jwt);
  }
  const promise = fetch(input, { ...init, headers });

  if (typeof window !== "undefined") {
    promise.then(
      (res) => {
        if (res.status === 401) {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : String(input);
          window.dispatchEvent(
            new CustomEvent<ZkLoginExpiredDetail>(ZKLOGIN_EXPIRED_EVENT, {
              detail: { url },
            })
          );
        }
      },
      () => {
        // Network errors are intentionally swallowed.
      }
    );
  }

  return promise;
}
