'use client';

import { useEffect } from 'react';
import { useVersionCheck } from '@/hooks/useVersionCheck';

const RELOADED_FLAG = 't2000:chunk-reloaded-at';
const RELOAD_COOLDOWN_MS = 60_000; // never auto-reload more than once a minute

/**
 * Last-line-of-defence safety net for the post-deploy stale-bundle
 * scenario:
 *
 * - `useVersionCheck` is the polite path — it polls `/api/build-id`
 *   and shows a toast asking the user to refresh.
 * - This component is the rescue path — if a navigation actually
 *   tries to load a chunk that no longer exists (because Vercel
 *   Skew Protection's window expired or the user ignored the toast),
 *   we get a `ChunkLoadError` from webpack/next. Without intervention
 *   the app sits in a broken half-rendered state and users sign out
 *   to recover. Instead, we detect that specific error class and do
 *   one forced `window.location.reload()` to pull a fresh HTML +
 *   chunk manifest.
 *
 * The reload is rate-limited via sessionStorage so a genuinely
 * broken deploy can't put the tab in a refresh loop. If the second
 * load also throws a chunk error within the cooldown, we surface the
 * error normally and let the user/error boundary handle it.
 *
 * Both `error` and `unhandledrejection` are watched because Next can
 * surface chunk errors through either path depending on whether the
 * navigation was sync (router push) or async (dynamic import).
 *
 * This component renders nothing — it's a hook host. It also calls
 * `useVersionCheck` so we only have one mount point to reason about.
 */
export function ChunkErrorReloader() {
  useVersionCheck();

  useEffect(() => {
    function isChunkLoadError(value: unknown): boolean {
      if (!value) return false;
      if (typeof value === 'string') {
        return /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module/i.test(value);
      }
      if (value instanceof Error) {
        if (value.name === 'ChunkLoadError') return true;
        return isChunkLoadError(value.message);
      }
      if (typeof value === 'object' && value !== null) {
        const maybe = value as { name?: string; message?: string };
        if (maybe.name === 'ChunkLoadError') return true;
        if (maybe.message) return isChunkLoadError(maybe.message);
      }
      return false;
    }

    function tryReload(reason: string): boolean {
      try {
        const last = Number(sessionStorage.getItem(RELOADED_FLAG)) || 0;
        if (Date.now() - last < RELOAD_COOLDOWN_MS) {
          console.warn('[ChunkErrorReloader] skipping reload (cooldown):', reason);
          return false;
        }
        sessionStorage.setItem(RELOADED_FLAG, String(Date.now()));
      } catch {
        // sessionStorage blocked (private mode etc.) — fall through and reload anyway.
      }
      console.warn('[ChunkErrorReloader] forcing reload:', reason);
      window.location.reload();
      return true;
    }

    function onError(event: ErrorEvent) {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        tryReload('error event');
      }
    }

    function onRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadError(event.reason)) {
        tryReload('unhandledrejection');
      }
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
