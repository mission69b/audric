/**
 * # Resumable-stream context — SPEC_AUDRIC_STREAM_RESUME
 *
 * Singleton `ResumableStreamContext` backed by the `resumable-stream`
 * package (https://www.npmjs.com/package/resumable-stream) and the same
 * `redis` (node-redis) client family that `lib/ratelimit.ts` uses.
 *
 * ## Why a dedicated module
 *
 * Three call sites consume the context:
 *   - POST `/api/chat`             — `createNewResumableStream` inside `consumeSseStream`
 *   - GET  `/api/chat/[id]/stream` — `resumeExistingStream`
 *   - POST `/api/chat/[id]/stop`   — clears `Chat.activeStreamId`; producer
 *                                    self-completes when the LLM stream
 *                                    naturally finishes
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
 * ## Degrade-open posture (no feature flag needed)
 *
 * Both clients lazy-connect on first use. If `env.REDIS_URL` is unset OR
 * init throws, `getResumableStreamContext()` returns `null` and the
 * chat route falls back to the v0.7e behavior (chat keeps working, no
 * resume). This matches `lib/ratelimit.ts`'s posture and means the
 * feature gracefully self-disables in any environment without Redis
 * (local dev without docker, preview deploys without Upstash, etc.)
 * without needing a separate kill-switch env var. Earlier drafts had a
 * dedicated `AUDRIC_STREAM_RESUME_ENABLED` flag; dropped because the
 * `REDIS_URL` presence + `Chat.activeStreamId` migration are already
 * the natural gates and a third gate added complexity without
 * preventing any failure mode.
 *
 * The `Chat.activeStreamId` Prisma column is the second natural gate:
 * the `prisma migrate deploy` step in the build script ensures the
 * column exists in every environment before this code runs against it.
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
 * Returns the singleton resumable-stream context, or `null` if Redis is
 * unconfigured or init failed.
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

    // Lazy connect — the resumable-stream library calls `.connect()`
    // itself when it needs either client (see
    // node_modules/resumable-stream/dist/runtime.js), so we don't need
    // to await here.
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
