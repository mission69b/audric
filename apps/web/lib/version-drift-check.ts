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
 * 2. Reload is deferred to the next `visibilitychange → hidden` —
 *    i.e. when the user switches tabs, minimizes the window, locks
 *    their device, etc. We deliberately do NOT use a hard timeout
 *    (e.g. "reload after 30s regardless") because it would yank an
 *    active user mid-action. For a financial app where the user
 *    might be reading a chart, drafting a confirmation, or waiting
 *    on a transaction receipt, losing UI state to a forced reload is
 *    worse than running on a slightly-stale build for a few extra
 *    minutes. The pre-existing 5-minute polling toast
 *    (`useVersionCheck`) is the fallback for users who keep the tab
 *    focused indefinitely — they get an actionable "Refresh" button
 *    instead of a yank.
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
    `[version-drift] new build detected (built=${BUILT_WITH_ID} → live=${driftedTo}); will auto-reload on next visibility-hidden`,
  );

  // [SPEC 22.5 — 2026-05-10] Visibility-only deferral. See file header
  // notes (2). We attach the listener and leave it attached until the
  // tab loses focus exactly once. For the rare always-focused tab,
  // the existing `useVersionCheck` 5-min poll surfaces a toast.
  function onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      document.removeEventListener('visibilitychange', onVisibility);
      performReload('visibility-hidden');
    }
  }

  // Already-hidden case (tab was background when drift was detected
  // — possible if the user backgrounded mid-stream and the response
  // arrived later). Reload immediately; no need to wait for a future
  // visibilitychange event that may not come for a while.
  if (document.visibilityState === 'hidden') {
    performReload('already-hidden');
    return;
  }

  document.addEventListener('visibilitychange', onVisibility);
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
