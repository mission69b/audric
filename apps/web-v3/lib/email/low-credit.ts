import "server-only";
import { createClient } from "redis";
import { getCreditBalanceMicros, getUserById } from "@/lib/db/queries";
import { EMAIL_FROM, sendEmail } from "./send";
import { LowCreditEmail } from "./templates/low-credit";

/**
 * Low-credit warning — the one custom billing email (Stripe doesn't know about
 * the USDC credit ledger). Anti-spam: at most ONE warning per window, via a Redis
 * key with TTL. Best-effort — never throws into the chat-finish path, no-ops if
 * Redis or RESEND_API_KEY is unavailable.
 */
const THRESHOLD_MICROS = 2_000_000; // warn when balance drops below $2
const THROTTLE_TTL_SECONDS = 7 * 24 * 60 * 60; // ≤ 1 warning / week per user

let client: ReturnType<typeof createClient> | null = null;
function getRedis() {
  if (!client && process.env.REDIS_URL) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => undefined);
    client.connect().catch(() => {
      client = null;
    });
  }
  return client;
}

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

export async function maybeLowCreditWarning(userId: string): Promise<void> {
  try {
    const u = await getUserById(userId);
    // No email to send to, or auto-recharge already keeps them topped up.
    if (!u?.email || u.autoRechargeEnabled) {
      return;
    }
    const balance = await getCreditBalanceMicros(userId);
    if (balance >= THRESHOLD_MICROS) {
      return;
    }
    // Throttle on a Redis key (NX) so we warn at most once per TTL window.
    const redis = getRedis();
    if (!redis?.isReady) {
      return;
    }
    const set = await redis.set(`lowcredit:${userId}`, "1", {
      NX: true,
      EX: THROTTLE_TTL_SECONDS,
    });
    if (set !== "OK") {
      return; // already warned within the window
    }
    await sendEmail({
      to: u.email,
      subject: "You're running low on Audric credit",
      react: LowCreditEmail({ balanceUsd: usd(balance) }),
      from: EMAIL_FROM.system,
    });
  } catch {
    // best-effort — never disrupt the chat finish path
  }
}
