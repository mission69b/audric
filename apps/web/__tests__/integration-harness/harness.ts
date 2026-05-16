/**
 * Integration harness — runs a single prompt through the chat route
 * with all external dependencies mocked, captures the SSE event stream
 * + persisted session + (eventually) rehydrated render shape.
 *
 * SPEC 37 v0.7a Phase 2 Day 14+ / 2026-05-16 — see
 * `README.md` in this directory for the full design rationale.
 *
 * This is the Day 14 minimum-viable scaffold. It does NOT yet:
 *   - Mock Anthropic via fixture record/replay (next phase). Tests
 *     using this harness must vi.mock the model layer themselves
 *     OR use the stub model from `setup/mock-llm.ts` (added next).
 *   - Mock Sui RPC / BlockVision / NAVI MCP / sponsored-tx routes
 *     (next phases).
 *   - Run BOTH legacy and v2 engines side-by-side for comparison
 *     (next phase — once we have a stable single-engine run path).
 *
 * What it DOES today:
 *   - Constructs a NextRequest for /api/engine/chat with a test wallet.
 *   - Calls the route handler directly (no Next.js server spin-up).
 *   - Captures the SSE stream emitted by the route.
 *   - Reads the persisted session from the in-memory Redis mock.
 *   - Returns a CapturedRun with all of the above.
 *
 * Once mock-llm.ts lands, this harness will exercise the FULL
 * data-loss bug class (Day 13.7) deterministically without touching
 * production.
 */

import { vi } from 'vitest';
import type { ContentBlock, PendingAction } from '@t2000/engine';
import { getInMemorySessionStore } from './setup/mock-redis';

/**
 * What a single harness run produces. Two of these (legacy + v2) get
 * diffed by `diff.ts` (added in a later phase) to surface bugs.
 */
export interface CapturedRun {
  /** Engine version that ran this prompt. */
  harnessVersion: 'legacy' | 'v2';

  /** Session ID assigned to this run (auto-generated when omitted). */
  sessionId: string;

  /** Wallet address used as the authenticated identity. */
  walletAddress: string;

  /**
   * Every SSE event the chat route emitted, in order. Raw decoded
   * objects (post-JSON.parse, post-`data: ` strip). The first phase
   * keeps them verbatim; later phases will add a `normalize()`
   * helper that strips toolCallIds/attemptIds/timestamps for stable
   * diffing.
   */
  sseEvents: Array<Record<string, unknown>>;

  /**
   * What was persisted to the in-memory Redis mock at the end of
   * the run. `null` if the session was never written.
   */
  persistedSession: {
    id: string;
    messages: Array<{ role: string; content: readonly ContentBlock[] | string }>;
    pendingAction: PendingAction | null;
    usage: { inputTokens: number; outputTokens: number };
    metadata: Record<string, unknown>;
  } | null;

  /**
   * HTTP-level outcomes — status code, response headers, any caught
   * errors. The route handler should always return 200 + SSE; non-200
   * usually means auth or input validation failed.
   */
  http: {
    status: number;
    headers: Record<string, string>;
  };

  /** Wall-clock duration of the route handler call (ms). */
  durationMs: number;
}

export interface RunOptions {
  /** The user prompt. */
  prompt: string;
  /** Wallet to act as (defaults to the test wallet from mock-auth). */
  walletAddress?: string;
  /**
   * Session ID — pass an existing one to continue a session, or
   * omit to start fresh.
   */
  sessionId?: string;
  /**
   * Which engine to use. v2 is the default since that's what we're
   * trying to validate; pass 'legacy' to capture the reference.
   */
  harnessVersion?: 'legacy' | 'v2';
  /**
   * Extra request headers (rarely needed — the harness already
   * injects auth + content-type).
   */
  extraHeaders?: Record<string, string>;
}

/**
 * Drive a single prompt through the chat route. Returns a CapturedRun
 * with the SSE stream + persisted session.
 *
 * Pre-conditions:
 *   - `mockAuth()` was called in `beforeAll`
 *   - `vi.mock('@/lib/engine/engine-factory')` redirected `getSessionStore`
 *     to `getInMemorySessionStore()`
 *   - A model mock (stub or fixture) is installed (added next phase)
 *
 * Post-conditions:
 *   - `getInMemorySessionStore()` contains the persisted session
 *     (caller should `.reset()` in beforeEach for isolation).
 */
export async function runOnce(opts: RunOptions): Promise<CapturedRun> {
  const startedAt = Date.now();
  const walletAddress = opts.walletAddress ?? '0x7f2059fb1c395f4800809b4b97ed8e661535c8c55f89b1379b6b9d0208d2f6dc';
  const harnessVersion = opts.harnessVersion ?? 'v2';

  // Update the auth mock's wallet to match. Lazy-import so the mock
  // is already installed by the time this runs.
  const { setTestWallet } = await import('./setup/mock-auth');
  setTestWallet(walletAddress);

  // Pin the engine-factory's harness version. Audric's chat route
  // reads `harnessVersion` from session metadata (or env), so we
  // need to mock the engine-factory to honor what the test asked for.
  process.env.USE_AI_SDK_NATIVE_ENGINE = harnessVersion === 'v2' ? '1' : '0';

  // Construct a NextRequest. Audric's chat route reads:
  //   - x-zklogin-jwt header (auth — mocked to bypass)
  //   - JSON body: { message, sessionId?, ... }
  const { NextRequest } = await import('next/server');
  const body = JSON.stringify({
    message: opts.prompt,
    sessionId: opts.sessionId,
  });
  const request = new NextRequest('http://localhost:3000/api/engine/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-zklogin-jwt': 'test-jwt-bypassed-by-mock-auth',
      ...opts.extraHeaders,
    },
    body,
  });

  // Lazy-import the route handler so vi.mock'd dependencies resolve
  // correctly. Cyclical: importing the route eagerly at module top
  // would resolve `getSessionStore` BEFORE the test's vi.mock
  // applied.
  const route = await import('@/app/api/engine/chat/route');
  const response: Response = await route.POST(request);

  // Capture HTTP-level outcome.
  const http = {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };

  // Drain the SSE stream. Audric's chat route emits SSE-formatted
  // text-event-stream; each event is `data: <json>\n\n`. We parse
  // each event line back into an object.
  const sseEvents: Array<Record<string, unknown>> = [];
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by `\n\n`. Process complete events
      // and keep any trailing partial in the buffer.
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (!part.startsWith('data:')) continue;
        const json = part.slice(5).trim();
        if (!json) continue;
        try {
          sseEvents.push(JSON.parse(json));
        } catch (err) {
          // Surface parse failures as their own event so tests can
          // distinguish "route emitted garbage" from "route emitted
          // nothing".
          sseEvents.push({
            type: '__harness_parse_error__',
            raw: json,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // Read back the persisted session. The chat route should have
  // called `store.set(...)` in its finally block. If sessionId was
  // omitted, the route auto-generates one — we recover it from the
  // `X-Session-Id` response header (set by audric's chat route at
  // `route.ts:1400`).
  const resolvedSessionId =
    opts.sessionId ?? http.headers['x-session-id'] ?? '<unknown>';
  const persistedSessionRaw = getInMemorySessionStore().inspect(resolvedSessionId);
  const persistedSession = persistedSessionRaw
    ? {
        id: persistedSessionRaw.id,
        messages: (persistedSessionRaw.messages ?? []) as Array<{
          role: string;
          content: readonly ContentBlock[] | string;
        }>,
        pendingAction: persistedSessionRaw.pendingAction ?? null,
        usage: persistedSessionRaw.usage ?? { inputTokens: 0, outputTokens: 0 },
        metadata: (persistedSessionRaw.metadata ?? {}) as Record<string, unknown>,
      }
    : null;

  return {
    harnessVersion,
    sessionId: resolvedSessionId,
    walletAddress,
    sseEvents,
    persistedSession,
    http,
    durationMs: Date.now() - startedAt,
  };
}
