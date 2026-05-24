/**
 * Unit tests for `getResumableStreamContext()` —
 * SPEC_AUDRIC_STREAM_RESUME Phase 1.
 *
 * Tests the feature-flag + Redis-URL gate behavior. Doesn't exercise
 * the actual `resumable-stream` library or live Redis (covered by
 * Phase 2 manual smoke + Phase 3 preview soak per the SPEC).
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
// it in these flag-gate tests (`createResumableStreamContext` stashes
// it for later use inside `createNewResumableStream` / `resumeExistingStream`).
vi.mock("next/server", () => ({
  after: () => undefined,
}));

const ORIGINAL_FLAG = process.env.AUDRIC_STREAM_RESUME_ENABLED;
const ORIGINAL_REDIS = process.env.REDIS_URL;

async function loadFreshModule() {
  vi.resetModules();
  return await import("./resumable-stream");
}

describe("lib/resumable-stream — feature gate", () => {
  beforeEach(() => {
    delete process.env.AUDRIC_STREAM_RESUME_ENABLED;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.AUDRIC_STREAM_RESUME_ENABLED;
    } else {
      process.env.AUDRIC_STREAM_RESUME_ENABLED = ORIGINAL_FLAG;
    }
    if (ORIGINAL_REDIS === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = ORIGINAL_REDIS;
    }
  });

  it("returns null when feature flag is unset", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const { getResumableStreamContext } = await loadFreshModule();
    expect(getResumableStreamContext()).toBeNull();
  });

  it("returns null when feature flag is anything other than the exact string 'true'", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.AUDRIC_STREAM_RESUME_ENABLED = "1";
    const { getResumableStreamContext } = await loadFreshModule();
    expect(getResumableStreamContext()).toBeNull();
  });

  it("returns null when flag is on but REDIS_URL is absent", async () => {
    process.env.AUDRIC_STREAM_RESUME_ENABLED = "true";
    const { getResumableStreamContext } = await loadFreshModule();
    expect(getResumableStreamContext()).toBeNull();
  });

  it("returns a context when both flag and REDIS_URL are set", async () => {
    process.env.AUDRIC_STREAM_RESUME_ENABLED = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    const { getResumableStreamContext } = await loadFreshModule();
    const ctx = getResumableStreamContext();
    expect(ctx).not.toBeNull();
    expect(typeof ctx?.createNewResumableStream).toBe("function");
    expect(typeof ctx?.resumeExistingStream).toBe("function");
  });

  it("memoises across calls (singleton)", async () => {
    process.env.AUDRIC_STREAM_RESUME_ENABLED = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    const { getResumableStreamContext } = await loadFreshModule();
    const a = getResumableStreamContext();
    const b = getResumableStreamContext();
    expect(a).toBe(b);
  });

  it("memoises the null state too (doesn't retry init each call)", async () => {
    // Flag off → null cached on first call. Flipping the flag AFTER
    // first call doesn't recover — module-level state, intentional.
    const { getResumableStreamContext } = await loadFreshModule();
    expect(getResumableStreamContext()).toBeNull();
    process.env.AUDRIC_STREAM_RESUME_ENABLED = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    expect(getResumableStreamContext()).toBeNull();
  });
});
