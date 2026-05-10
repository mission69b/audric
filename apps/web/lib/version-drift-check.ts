'use client';

/**
 * SPEC 22.5 — Client version drift auto-reload.
 *
 * Companion to `useVersionCheck` (the polite 5-min poll + toast) and
 * `ChunkErrorReloader` (the chunk-load-failed rescue path). This module
 * is the *eager* version-drift path — every API response carries an
 * `X-App-Version` header (stamped by `middleware.ts`) and we compare
 * it against the build-time `NEXT_PUBLIC_DEPLOYMENT_ID` baked into
 * THIS bundle. On mismatch we schedule one auto-reload.
 *
 * Why this matters: without it, after a deploy a stale tab keeps
 * working until either (a) the user happens to navigate to a route
 * that hits a missing chunk → ChunkErrorReloader fires, or (b) up to
 * 5 minutes pass and `useVersionCheck` polls → toast appears, user
 * has to manually refresh. With this module, the next API call the
 * user makes (which is typically within seconds of any meaningful
 * action — chat, balance refresh, etc.) detects the drift and
 * auto-reloads on the next idle moment.
 *
 * Design notes:
 * 1. We monkey-patch `window.fetch` once. Idempotent via module flag.
 *    Every fetch call site goes through this — no need to refactor
 *    consumers.
 * 2. Reload is deferred to the next `visibilitychange → hidden` OR
 *    a 30s safety timeout, whichever fires first. This way the user's
 *    current action completes and renders before the page reloads;
 *    if they switch tabs, they come back to a fresh build with no
 *    flicker. If they stay active, we still reload after 30s to bound
 *    the staleness.
 * 3. SessionStorage cooldown (60s) prevents reload loops if a deploy
 *    is genuinely broken and the new build also returns mismatched
 *    headers (shouldn't happen, but defense-in-depth).
 * 4. Falls back gracefully on missing header (older API routes that
 *    skip middleware) — silent no-op, doesn't trigger reloads.
 * 5. Skips if `BUILT_WITH_ID === 'local-dev'` — pnpm dev sees the
 *    same id from middleware and from the bundle, but if those ever
 *    drift in dev (e.g. mid-HMR) we don't want forced reloads.
 */

import { env } from '@/lib/env';

const BUILT_WITH_ID = env.NEXT_PUBLIC_DEPLOYMENT_ID || 'local-dev';
const RELOAD_COOLDOWN_KEY = 't2000:version-drift-reloaded-at';
const RELOAD_COOLDOWN_MS = 60_000;
const RELOAD_DEFER_MS = 30_000;

let installed = false;
let reloadScheduled = false;

function withinCooldown(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_COOLDOWN_KEY)) || 0;
    return Date.now() - last < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_COOLDOWN_KEY, String(Date.now()));
  } catch {
    // sessionStorage blocked (private mode etc.) — proceed anyway, the
    // reload itself is the source of truth.
  }
}

function performReload(reason: string): void {
  if (withinCooldown()) {
    console.warn('[version-drift] skipping reload (cooldown):', reason);
    return;
  }
  markReloaded();
  console.warn('[version-drift] reloading for new build:', reason);
  window.location.reload();
}

function scheduleReload(driftedTo: string): void {
  if (reloadScheduled) return;
  reloadScheduled = true;

  console.warn(
    `[version-drift] new build detected (built=${BUILT_WITH_ID} → live=${driftedTo}); scheduling auto-reload`,
  );

  let timeoutId: number | null = null;

  function cleanup(): void {
    document.removeEventListener('visibilitychange', onVisibility);
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      cleanup();
      performReload('visibility-hidden');
    }
  }

  document.addEventListener('visibilitychange', onVisibility);

  timeoutId = window.setTimeout(() => {
    cleanup();
    performReload('defer-timeout');
  }, RELOAD_DEFER_MS);
}

function checkResponse(response: Response): void {
  if (reloadScheduled) return;
  const liveId = response.headers.get('X-App-Version');
  if (!liveId) return;
  if (liveId === 'local-dev' || liveId === BUILT_WITH_ID) return;
  scheduleReload(liveId);
}

export function installVersionDriftHandler(): void {
  if (typeof window === 'undefined') return;
  if (installed) return;
  if (BUILT_WITH_ID === 'local-dev') return;

  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(
    ...args: Parameters<typeof fetch>
  ): Promise<Response> {
    const response = await originalFetch(...args);
    try {
      checkResponse(response);
    } catch {
      // Never let header-check throw poison the underlying fetch.
    }
    return response;
  };
}

// Test-only hook to reset module state between tests. Not exported via
// the package barrel; consumers must import the module directly.
export function __resetVersionDriftForTests(): void {
  installed = false;
  reloadScheduled = false;
}
