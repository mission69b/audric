import { createClient } from "redis";

import { isProductionEnvironment } from "@/lib/constants";
import { env } from "@/lib/env";
import { ChatbotError } from "@/lib/errors";

const MAX_MESSAGES = 10;
const TTL_SECONDS = 60 * 60;

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  // [S.269 item 5 — 2026-05-23] Read through the env gate (`env.REDIS_URL`)
  // instead of `process.env.REDIS_URL` directly. The gate normalizes
  // empty strings to `undefined` (S.20 BV-incident bug class) and keeps
  // the audit's "no raw process.env reads" finding closed.
  if (!client && env.REDIS_URL) {
    client = createClient({ url: env.REDIS_URL });
    client.on("error", () => undefined);
    client.connect().catch(() => {
      client = null;
    });
  }
  return client;
}

export async function checkIpRateLimit(ip: string | undefined) {
  if (!isProductionEnvironment || !ip) {
    return;
  }

  const redis = getClient();
  if (!redis?.isReady) {
    return;
  }

  try {
    const key = `ip-rate-limit:${ip}`;
    const [count] = await redis
      .multi()
      .incr(key)
      .expire(key, TTL_SECONDS, "NX")
      .exec();

    if (typeof count === "number" && count > MAX_MESSAGES) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
  }
}
