/**
 * Unit tests for `getResumableStreamContext()` —
 * SPEC_AUDRIC_STREAM_RESUME.
 *
 * Tests the Redis-URL gate behavior (no feature flag — earlier draft's
 * `AUDRIC_STREAM_RESUME_ENABLED` was removed in favor of natural gates).
 * Doesn't exercise the actual `resumable-stream` library or live Redis
 * (covered by manual smoke + production soak per the SPEC).
 *
 * The module memoises its init via a `let context` + `let initAttempted`
 * pair, so each test uses `vi.resetModules()` + a fresh dynamic import
 * to get a clean singleton state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `lib/resumable-stream.ts` declares `import "server-only";` to catch
// accidental client imports at runtime. vitest runs in jsdom which the
// `server-only` package treats as a client environment and throws on
// import. Stub it to a no-op for tests — same pattern Next.js's own
// docs recommend for testing server modules.
vi.mock("server-only", () => ({}));

// Also stub `next/server`'s `after()` — the test environment isn't a
// Next.js request lifecycle, so the real implementation refuses to run.
// We only need the symbol to exist; the module loads it but never calls
// it in these gate tests (`createResumableStreamContext` stashes it for
// later use inside `createNewResumableStream` / `resumeExistingStream`).
vi.mock("next/server", () => ({
  after: () => undefined,
}));

const ORIGINAL_REDIS = process.env.REDIS_URL;

async function loadFreshModule() {
  vi.resetModules();
  return await import("./resumable-stream");
}

describe("lib/resumable-stream — gate", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (ORIGINAL_REDIS === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = ORIGINAL_REDIS;
    }
  });

  it("returns null when REDIS_URL is absent", async () => {
    const { getResumableStreamContext } = await loadFreshModule();
    expect(getResumableStreamContext()).toBeNull();
  });

  it("returns a context when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const { getResumableStreamContext } = await loadFreshModule();
    const ctx = getResumableStreamContext();
    expect(ctx).not.toBeNull();
    expect(typeof ctx?.createNewResumableStream).toBe("function");
    expect(typeof ctx?.resumeExistingStream).toBe("function");
  });

  it("memoises across calls (singleton)", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const { getResumableStreamContext } = await loadFreshModule();
    const a = getResumableStreamContext();
    const b = getResumableStreamContext();
    expect(a).toBe(b);
  });

  it("memoises the null state too (doesn't retry init each call)", async () => {
    // REDIS_URL absent → null cached on first call. Setting REDIS_URL
    // AFTER first call doesn't recover — module-level state, intentional.
    const { getResumableStreamContext } = await loadFreshModule();
    expect(getResumableStreamContext()).toBeNull();
    process.env.REDIS_URL = "redis://localhost:6379";
    expect(getResumableStreamContext()).toBeNull();
  });
});
