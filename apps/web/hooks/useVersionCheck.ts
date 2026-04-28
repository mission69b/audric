'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import { env } from '@/lib/env';

// `NEXT_PUBLIC_DEPLOYMENT_ID` is baked into the client bundle by
// `next.config.ts` (which mirrors the `deploymentId` field into the
// public env at build time). We read the same thing back here so the
// comparison is build-time vs run-time, not run-time vs run-time
// (which would always match).
//
// Server-only `VERCEL_*` fallbacks were removed: on the client they
// are stripped to `undefined` by Next's bundler anyway, and reading
// them through `env.X` here would throw the proxy guard. The
// `next.config.ts` resolver already folds those server vars into
// `NEXT_PUBLIC_DEPLOYMENT_ID` at build time so the chain still works.
//
// In dev (`pnpm dev`) the env is `'local-dev'` and the polled value
// is also `'local-dev'`, so the toast never fires.
const BUILT_WITH_ID = env.NEXT_PUBLIC_DEPLOYMENT_ID || 'local-dev';

const POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes — gentle, no thrash.
const FOCUS_DEBOUNCE_MS = 30_000;    // re-check on tab focus, but at most once per 30s.

let toastShown = false;

/**
 * Detect when the deployed version has moved on from the version this
 * tab was loaded from, and offer the user a one-tap refresh.
 *
 * Why this exists, in two beats:
 * 1. Vercel Skew Protection (configured via `next.config.ts`
 *    `deploymentId`) silently routes this old tab to the deployment
 *    that served it — but only for ~12 hours. During that window the
 *    user keeps working without flicker.
 * 2. After the window, or for users who never had skew protection
 *    routing applied, the next page navigation would 404 against
 *    chunks that no longer exist. Before that happens, this hook
 *    notices the mismatch on focus / interval and shows a friendly
 *    "New version available" toast. The user can refresh on their
 *    own terms instead of being yanked mid-action.
 *
 * The hook is mount-once (idempotent via `toastShown` module flag),
 * and never auto-reloads — the dedicated ChunkLoadError listener in
 * `ChunkErrorReloader` is the safety net for cases where the user
 * doesn't see the toast and triggers a chunk-load anyway.
 */
export function useVersionCheck() {
  const { richToast } = useToast();
  const lastFocusCheckRef = useRef<number>(0);

  useEffect(() => {
    if (BUILT_WITH_ID === 'local-dev') return;
    if (toastShown) return;

    let cancelled = false;

    async function check() {
      if (cancelled || toastShown) return;
      try {
        const res = await fetch('/api/build-id', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { id?: string };
        const liveId = data.id;
        if (!liveId || liveId === BUILT_WITH_ID || liveId === 'local-dev') {
          return;
        }
        toastShown = true;
        richToast({
          title: 'New version available',
          message: "Audric was updated. Refresh to load the latest — your work is saved.",
          variant: 'info',
          duration: 60_000,
          actions: [
            {
              label: 'Refresh',
              variant: 'primary',
              onClick: () => {
                window.location.reload();
              },
            },
          ],
        });
      } catch {
        // Network blip — not worth surfacing. The next focus or poll tick will retry.
      }
    }

    void check();

    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    function onFocus() {
      const now = Date.now();
      if (now - lastFocusCheckRef.current < FOCUS_DEBOUNCE_MS) return;
      lastFocusCheckRef.current = now;
      void check();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [richToast]);
}
