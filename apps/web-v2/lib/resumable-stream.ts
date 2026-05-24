/**
 * # Resumable-stream context — SPEC_AUDRIC_STREAM_RESUME Phase 1
 *
 * Singleton `ResumableStreamContext` backed by the `resumable-stream`
 * package (https://www.npmjs.com/package/resumable-stream) and the same
 * `redis` (node-redis) client family that `lib/ratelimit.ts` uses.
 *
 * ## Why a dedicated module
 *
 * Three call sites consume the context:
 *   - POST `/api/chat`     — `createNewResumableStream` inside `consumeSseStream`
 *   - GET  `/api/chat/[id]/stream` — `resumeExistingStream`
 *   - POST `/api/chat/[id]/stop`   — close stream (via the underlying
 *                                    client; library has no explicit cancel,
 *                                    so we set the chat's activeStreamId to
 *                                    null and the producer self-completes
 *                                    when the LLM stream naturally finishes
 *                                    or the abort signal we keep on hand
 *                                    fires)
 *
 * Centralising the factory keeps the env-gate convention honest (no raw
 * `process.env.REDIS_URL` reads — the package's default reads
 * `process.env.REDIS_URL || process.env.KV_URL` directly, which would
 * bypass our `lib/env.ts` validation gate per
 * `.cursor/rules/env-validation-gate.mdc`).
 *
 * ## Why explicit publisher/subscriber clients
 *
 * `redis` (node-redis) requires SEPARATE clients for publish vs. subscribe
 * — once a client enters subscriber mode it can't run normal commands.
 * The `resumable-stream` library's default factory creates two clients
 * already; we mirror that, just routed through the env gate.
 *
 * Both clients lazy-connect on first use and degrade open: if connection
 * fails or `env.REDIS_URL` is absent, `getResumableStreamContext()`
 * returns `null` and callers fall back to the v0.7e behavior (chat keeps
 * working, no resume). This matches the same posture as `lib/ratelimit.ts`.
 *
 * ## Feature flag
 *
 * `env.AUDRIC_STREAM_RESUME_ENABLED === "true"` is required for any of
 * this to wire — when absent, `getResumableStreamContext()` returns
 * `null` even if Redis is configured. Lets us ship the code in production
 * without enabling the feature until the migration has soaked.
 */

import "server-only";

import { after } from "next/server";
import { createClient } from "redis";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";

import { env } from "@/lib/env";

let context: ResumableStreamContext | null = null;
let initAttempted = false;

/**
 * Returns the singleton resumable-stream context, or `null` if the
 * feature is disabled (flag off, REDIS_URL absent, or init failed).
 *
 * Callers MUST handle the null case — when null, the chat route should
 * skip the `consumeSseStream` wiring entirely, and the GET / stop
 * routes should return 204 / no-op respectively.
 */
export function getResumableStreamContext(): ResumableStreamContext | null {
  if (initAttempted) {
    return context;
  }
  initAttempted = true;

  if (env.AUDRIC_STREAM_RESUME_ENABLED !== "true") {
    return null;
  }

  if (!env.REDIS_URL) {
    return null;
  }

  try {
    const publisher = createClient({ url: env.REDIS_URL });
    const subscriber = createClient({ url: env.REDIS_URL });

    publisher.on("error", (err) => {
      console.error("[resumable-stream] publisher error:", err);
    });
    subscriber.on("error", (err) => {
      console.error("[resumable-stream] subscriber error:", err);
    });

    // Lazy connect — both clients fire-and-forget; if either fails the
    // first operation rejects and the caller surfaces it. The
    // resumable-stream library calls `.connect()` itself when it needs
    // either client (see node_modules/resumable-stream/dist/runtime.js),
    // so we don't need to await here.
    context = createResumableStreamContext({
      waitUntil: after,
      publisher,
      subscriber,
    });
    return context;
  } catch (err) {
    console.error("[resumable-stream] init failed:", err);
    context = null;
    return null;
  }
}
