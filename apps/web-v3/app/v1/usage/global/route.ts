import { db } from "@audric/accounts";
import { apiUsageEvent } from "@audric/accounts/schema";
import { sql } from "drizzle-orm";
import { getReadyRedisClient } from "@/lib/ratelimit";

// GET /v1/usage/global — the transparent public usage feed (founder call
// 2026-07-20, opengateway-style). Aggregates over ApiUsageEvent — OUR
// gateway-edge metering, not the upstream provider's dashboard. Aggregates
// only: no per-user, per-key, or prompt-adjacent data ever leaves here (the
// ZDR story is untouched — we can't show your prompts; we can prove the rail
// is used).
//
// PUBLIC (no key), cached in Redis for 5 minutes — one SQL pass per 5 min
// worst case, safe to hammer. `?fresh=1` is NOT offered on purpose.

const CACHE_KEY = "usage:global:v2";
const CACHE_TTL_SECONDS = 300;

type UsageSlice = { requests: number; tokens: number };

type GlobalUsage = {
  updated_at: string;
  counting_since: string | null;
  days_live: number;
  all_time: {
    requests: number;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    /** Micro-USD charged across all metered requests, as USD. */
    compute_usd: number;
    models_served: number;
    /** Every model ever served, by tokens — the durable leaderboard
     * (the 24h one goes quiet between bursts). */
    models: Array<{
      model: string;
      requests: number;
      tokens: number;
      share: number;
    }>;
    /** private = ZDR routing · confidential = GPU-TEE with receipts. */
    by_tier: { private: UsageSlice; confidential: UsageSlice };
    /** api = /v1 keys · chat = in-app Audric turns (recorded from
     * 2026-07-20 on; earlier chat usage was ledger-only, not backfilled). */
    by_source: { api: UsageSlice; chat: UsageSlice };
  };
  last_24h: {
    requests: number;
    tokens: number;
    /** 24 rows, oldest→newest, UTC hour buckets. */
    hourly: Array<{ hour: string; requests: number; tokens: number }>;
    /** Top models by tokens, with share of the 24h token total. */
    models: Array<{
      model: string;
      requests: number;
      tokens: number;
      share: number;
    }>;
  };
};

async function computeGlobalUsage(): Promise<GlobalUsage> {
  const tokensExpr = sql<number>`coalesce(sum(${apiUsageEvent.inputTokens} + ${apiUsageEvent.outputTokens}), 0)::bigint`;

  // Timestamps come back as epoch seconds — `createdAt` is `timestamp`
  // WITHOUT time zone, and letting the driver parse it applies the server's
  // LOCAL offset (verified live: UTC+10 shifted every hour bucket by 10h and
  // silently dropped the ones that fell outside the 24-slot window).
  const [totals] = await db
    .select({
      requests: sql<number>`count(*)::bigint`,
      inputTokens: sql<number>`coalesce(sum(${apiUsageEvent.inputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${apiUsageEvent.outputTokens}), 0)::bigint`,
      costMicros: sql<number>`coalesce(sum(${apiUsageEvent.costMicros}), 0)::bigint`,
      models: sql<number>`count(distinct ${apiUsageEvent.model})::bigint`,
      sinceEpoch: sql<number | null>`extract(epoch from min(${apiUsageEvent.createdAt}))`,
    })
    .from(apiUsageEvent);

  const hourly = await db
    .select({
      hourEpoch: sql<number>`extract(epoch from date_trunc('hour', ${apiUsageEvent.createdAt}))::bigint`,
      requests: sql<number>`count(*)::bigint`,
      tokens: tokensExpr,
    })
    .from(apiUsageEvent)
    .where(sql`${apiUsageEvent.createdAt} > now() - interval '24 hours'`)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const leaderboard = await db
    .select({
      model: apiUsageEvent.model,
      requests: sql<number>`count(*)::bigint`,
      tokens: tokensExpr,
    })
    .from(apiUsageEvent)
    .where(sql`${apiUsageEvent.createdAt} > now() - interval '24 hours'`)
    .groupBy(apiUsageEvent.model)
    .orderBy(sql`3 desc`)
    .limit(10);

  const allTimeModels = await db
    .select({
      model: apiUsageEvent.model,
      requests: sql<number>`count(*)::bigint`,
      tokens: tokensExpr,
    })
    .from(apiUsageEvent)
    .groupBy(apiUsageEvent.model)
    .orderBy(sql`3 desc`)
    .limit(50);

  const slices = await db
    .select({
      tier: apiUsageEvent.privacyTier,
      source: apiUsageEvent.source,
      requests: sql<number>`count(*)::bigint`,
      tokens: tokensExpr,
    })
    .from(apiUsageEvent)
    .groupBy(apiUsageEvent.privacyTier, apiUsageEvent.source);

  // Dense 24-bucket series (missing hours render as zero bars, like the
  // reference page) — keyed on the UTC hour epoch.
  const byHour = new Map(hourly.map((h) => [Number(h.hourEpoch), h]));
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const series: GlobalUsage["last_24h"]["hourly"] = [];
  for (let i = 23; i >= 0; i--) {
    const bucketMs = now.getTime() - i * 3_600_000;
    const row = byHour.get(bucketMs / 1000);
    series.push({
      hour: new Date(bucketMs).toISOString(),
      requests: Number(row?.requests ?? 0),
      tokens: Number(row?.tokens ?? 0),
    });
  }

  // 24h totals from the SQL rows (the dense chart window can clip the oldest
  // partial hour) — keeps `share` consistent with the leaderboard query.
  const dayTokens = hourly.reduce((n, h) => n + Number(h.tokens), 0);
  const dayRequests = hourly.reduce((n, h) => n + Number(h.requests), 0);
  const since =
    totals.sinceEpoch !== null
      ? new Date(Number(totals.sinceEpoch) * 1000)
      : null;

  const allTokens = Number(totals.inputTokens) + Number(totals.outputTokens);
  const emptySlice = (): UsageSlice => ({ requests: 0, tokens: 0 });
  const byTier = { private: emptySlice(), confidential: emptySlice() };
  const bySource = { api: emptySlice(), chat: emptySlice() };
  for (const s of slices) {
    const tier = byTier[s.tier as keyof typeof byTier];
    const source = bySource[s.source as keyof typeof bySource];
    if (tier) {
      tier.requests += Number(s.requests);
      tier.tokens += Number(s.tokens);
    }
    if (source) {
      source.requests += Number(s.requests);
      source.tokens += Number(s.tokens);
    }
  }

  return {
    updated_at: new Date().toISOString(),
    counting_since: since ? since.toISOString() : null,
    days_live: since
      ? Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86_400_000))
      : 0,
    all_time: {
      requests: Number(totals.requests),
      tokens: Number(totals.inputTokens) + Number(totals.outputTokens),
      input_tokens: Number(totals.inputTokens),
      output_tokens: Number(totals.outputTokens),
      compute_usd: Number(totals.costMicros) / 1_000_000,
      models_served: Number(totals.models),
      models: allTimeModels.map((m) => ({
        model: m.model,
        requests: Number(m.requests),
        tokens: Number(m.tokens),
        share: allTokens > 0 ? Number(m.tokens) / allTokens : 0,
      })),
      by_tier: byTier,
      by_source: bySource,
    },
    last_24h: {
      requests: dayRequests,
      tokens: dayTokens,
      hourly: series,
      models: leaderboard.map((m) => ({
        model: m.model,
        requests: Number(m.requests),
        tokens: Number(m.tokens),
        share: dayTokens > 0 ? Number(m.tokens) / dayTokens : 0,
      })),
    },
  };
}

export async function GET() {
  const redis = await getReadyRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        return Response.json(JSON.parse(cached), {
          headers: { "x-usage-cache": "hit" },
        });
      }
    } catch {
      // fall through to a fresh compute
    }
  }

  const usage = await computeGlobalUsage();

  if (redis) {
    try {
      await redis.set(CACHE_KEY, JSON.stringify(usage), {
        EX: CACHE_TTL_SECONDS,
      });
    } catch {
      // cache write is best-effort
    }
  }

  return Response.json(usage, { headers: { "x-usage-cache": "miss" } });
}
