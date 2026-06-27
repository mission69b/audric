import { createClient } from "redis";

import { isProductionEnvironment } from "@/lib/constants";
import { ChatbotError } from "@/lib/errors";

// THE live anonymous (not-signed-in) cap — anon has no user row, so it's gated
// here by IP, NOT by the per-user daily cap in the chat route. This is the wall
// that triggers the sign-in nudge, so it's the real conversion lever: a guest
// gets a small taste, then signing up unlocks the 20/day free tier. Hourly (not
// daily) on purpose — shared IPs (offices, mobile NAT) make a daily IP cap
// risky; the hourly reset is a safety valve against blocking innocent users.
const MAX_MESSAGES = 5;
const TTL_SECONDS = 60 * 60;

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client && process.env.REDIS_URL) {
    client = createClient({ url: process.env.REDIS_URL });
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
