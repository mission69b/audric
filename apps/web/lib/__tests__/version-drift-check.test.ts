/**
 * SPEC 22.5 — Tests for the client version-drift auto-reload module.
 *
 * The module monkey-patches `window.fetch`, watches every response's
 * `X-App-Version` header, and schedules an auto-reload (visibility-
 * change OR 30s timeout, whichever first) when the live build id no
 * longer matches the build-time id baked into THIS bundle.
 *
 * These tests pin every emit/skip decision and the cooldown semantics.
 *
 * IMPORTANT: `BUILT_WITH_ID` is captured at MODULE-INIT time from
 * `env.NEXT_PUBLIC_DEPLOYMENT_ID`. The `env` proxy itself is built
 * once when `lib/env.ts` is first imported (which happens in
 * `vitest.setup.ts`). To make `vi.stubEnv` actually affect the
 * module's `BUILT_WITH_ID`, every test does:
 *   1. `vi.resetModules()` — clear the module cache so a fresh import
 *      will re-evaluate both `lib/env.ts` and our module.
 *   2. `process.env.NEXT_PUBLIC_DEPLOYMENT_ID = '...'` — set the
 *      build-time id this test cares about.
 *   3. `await import('../version-drift-check')` — pull in the freshly-
 *      parsed module.
 *
 * Without that dance, every test reads whatever value was in the env
 * at the time `vitest.setup.ts` ran (which doesn't set
 * `NEXT_PUBLIC_DEPLOYMENT_ID`, so the proxy returns `undefined` and
 * `BUILT_WITH_ID` falls back to `'local-dev'` — at which point the
 * install early-returns and reload is never scheduled).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalLocation = window.location;
const originalFetch = window.fetch;
const originalEnvDeployment = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;
let reloadMock: ReturnType<typeof vi.fn>;

function makeResponse(headers: Record<string, string>): Response {
  return new Response(null, {
    status: 200,
    headers: new Headers(headers),
  });
}

async function importWithDeploymentId(
  id: string | undefined,
): Promise<typeof import('../version-drift-check')> {
  vi.resetModules();
  if (id === undefined) {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_ID;
  } else {
    process.env.NEXT_PUBLIC_DEPLOYMENT_ID = id;
  }
  return import('../version-drift-check');
}

beforeEach(() => {
  // jsdom defines `window.location` as a non-configurable getter, so
  // `vi.spyOn(window.location, 'reload')` throws. Workaround: replace
  // the whole `location` with a writable proxy whose `reload` is a
  // vitest mock fn we can assert on.
  reloadMock = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...originalLocation, reload: reloadMock },
  });
  window.fetch = originalFetch;
  try {
    sessionStorage.removeItem('t2000:version-drift-reloaded-at');
  } catch {
    // Ignore.
  }
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
  window.fetch = originalFetch;
  if (originalEnvDeployment === undefined) {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_ID;
  } else {
    process.env.NEXT_PUBLIC_DEPLOYMENT_ID = originalEnvDeployment;
  }
});

describe('installVersionDriftHandler', () => {
  it('is idempotent (second install does not re-wrap fetch)', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    installVersionDriftHandler();
    const firstWrapped = window.fetch;
    installVersionDriftHandler();
    const secondWrapped = window.fetch;
    expect(secondWrapped).toBe(firstWrapped);
  });

  it('skips install when BUILT_WITH_ID is local-dev', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId(undefined);
    const beforeFetch = window.fetch;
    installVersionDriftHandler();
    expect(window.fetch).toBe(beforeFetch);
  });

  it('passes through fetch responses unchanged when header missing', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = makeResponse({});
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    const result = await window.fetch('/api/anything');
    expect(result).toBe(response);
  });

  it('passes through fetch responses unchanged when header matches built id', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = makeResponse({ 'X-App-Version': 'dpl_built_v1' });
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    const result = await window.fetch('/api/anything');
    expect(result).toBe(response);
  });

  it('ignores X-App-Version=local-dev (dev environment)', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = makeResponse({ 'X-App-Version': 'local-dev' });
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    await window.fetch('/api/anything');
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does NOT auto-reload while tab is focused (no hard timeout)', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = makeResponse({ 'X-App-Version': 'dpl_new_v2' });
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    await window.fetch('/api/anything');
    // Even after a long wait, no reload while tab stays focused.
    // Active users keep their UI state; the toast fallback handles
    // long-focused sessions.
    vi.advanceTimersByTime(60 * 60_000);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('reloads on visibilitychange→hidden after drift detected', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = makeResponse({ 'X-App-Version': 'dpl_new_v2' });
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    await window.fetch('/api/anything');
    expect(reloadMock).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('reloads immediately when tab is already hidden at drift detection', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = makeResponse({ 'X-App-Version': 'dpl_new_v2' });
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    // User backgrounded the tab before our SSE response arrived.
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    await window.fetch('/api/anything');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('subsequent visibility cycles after one reload do not double-fire', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = makeResponse({ 'X-App-Version': 'dpl_new_v2' });
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    await window.fetch('/api/anything');

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reloadMock).toHaveBeenCalledTimes(1);

    // Toggle visibility again — listener was removed, no double-fire.
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('only schedules ONE listener across multiple drift-detected fetches', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = makeResponse({ 'X-App-Version': 'dpl_new_v2' });
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    await window.fetch('/api/a');
    await window.fetch('/api/b');
    await window.fetch('/api/c');

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('respects 60s sessionStorage cooldown across reload attempts', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    sessionStorage.setItem(
      't2000:version-drift-reloaded-at',
      String(Date.now() - 1000),
    );

    const response = makeResponse({ 'X-App-Version': 'dpl_new_v2' });
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    await window.fetch('/api/anything');

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does not poison fetch when header check throws', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const response = {
      headers: {
        get: () => {
          throw new Error('synthetic header read error');
        },
      },
    } as unknown as Response;
    window.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
    installVersionDriftHandler();

    const result = await window.fetch('/api/anything');
    expect(result).toBe(response);
  });

  it('propagates fetch rejections (drift check does not swallow underlying errors)', async () => {
    const { installVersionDriftHandler } = await importWithDeploymentId('dpl_built_v1');
    const fetchError = new Error('network blip');
    window.fetch = vi.fn().mockRejectedValue(fetchError) as typeof fetch;
    installVersionDriftHandler();

    await expect(window.fetch('/api/anything')).rejects.toThrow('network blip');
  });
});
