/**
 * Upstash Redis client (REST) — shared across web-v2 features that need
 * cross-request / cross-instance persistence.
 *
 * **Why a separate file from `lib/redis` / `redis@^5.0.0`?** The `redis`
 * npm package already in our deps powers `resumable-stream` (transport-
 * level streaming primitives), not key-value state. Upstash's REST client
 * is the right shape for serverless edge / Node Lambda envs (no TCP
 * connection pooling, no socket lifecycle). Keeping them in separate
 * modules makes the boundary clear: this file = durable state, `redis`
 * package = stream transport.
 *
 * **Why nullable client?** `UPSTASH_REDIS_REST_URL` +
 * `UPSTASH_REDIS_REST_TOKEN` are intentionally optional (see `lib/env.ts`
 * doc on the vars). When absent the module exports `null`; consumers
 * (`session-spend.ts` and future checkpoint stores) detect the null and
 * fall back to a degraded-but-safe path. This lets web-v2 boot cleanly
 * during local dev / preview deploys before the founder copies the
 * Upstash vars into the audric-web-v2 Vercel project, without surrendering
 * the env-validation-gate principle (every var still flows through the
 * typed `env` proxy, never raw `process.env`).
 *
 * Constructed eagerly at module load so misconfigured runtime errors
 * (auth failures, malformed URLs) surface during boot instead of on
 * first read.
 *
 * First consumer: `lib/audric/session-spend.ts` (Group E — wired
 * 2026-05-21 / S.214 follow-on). Future consumers (stream-checkpoint
 * store, conversation-state store, etc.) plug into the same client.
 */
import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";

export const upstash =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;
