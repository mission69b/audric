# Runbook: Scaling alerts

**Goal:** Make the metrics shipped in PR 5 of the audric-scaling-spec actionable. Without alerts, a 90% → 60% cache hit drop (or a circuit breaker stuck open) goes unnoticed until a user complains.

**Where alerts live.** Vercel Observability dashboard. There is no code involved — alerts are configured via the Vercel project UI against the structured logs already emitted by `lib/telemetry.ts` (counters/gauges/histograms tagged `name=...`).

**Where the metrics live.** Three surfaces:
1. Audric Vercel logs — the `kind=metric` JSON lines
2. ECS CloudWatch logs — the daily cron emits the same JSON shape (filter pattern `{ $.kind = "metric" && $.name = "cron.*" }`)
3. `/admin/scaling` (founder-only, uses `T2000_INTERNAL_KEY`) — current snapshot

## Alerts to configure

| Alert | Threshold | Severity | Destination |
|---|---|---|---|
| `bv.cb_open` gauge stays at 1 for > 5 min | 5 min | P1 — page on-call | Slack `#audric-alerts` + email |
| `navi.cb_open` gauge stays at 1 for > 5 min | 5 min | P1 — page on-call | Slack `#audric-alerts` + email |
| `bv.cache_hit / bv.requests` ratio drops below 0.85 over 15 min window | 15 min | P3 — Slack only | Slack `#audric-alerts` |
| `cron.fin_ctx_shard_duration_ms` p99 > 240,000ms (4 min — 80% of the 5min budget) | per-run | P3 — Slack only | Slack `#audric-alerts` |
| `anthropic.tokens` daily counter exceeds budget ($150 USD/day) | daily 09:00 UTC | P3 — email | Email |
| `upstash.requests` rate exceeds 80% of monthly cap (Pay-as-you-go: 500K/day) | daily | P3 — email | Email |
| `sui_rpc.requests` 429-tagged rate > 5% over 10 min window | 10 min | P3 — Slack only | Slack `#audric-alerts` |

## Setup steps (one-time per Vercel project)

1. **Create the Slack webhook.** In Slack admin, create an incoming webhook for `#audric-alerts` (or whatever channel the founder prefers). Copy the URL.
2. **Add the webhook to Vercel.** Vercel project → Settings → Integrations → Slack → Add webhook URL. Test with a sample message.
3. **For each alert in the table above:**
   - Vercel project → Observability → Logs → search for the metric name (e.g. `name="bv.cb_open"` and `value=1`)
   - Click "Save Search" → "Create Alert"
   - Set the threshold per the table
   - Set the destination per the table
   - Name it identically to the metric (`bv.cb_open` → "BV circuit breaker open > 5 min")
4. **Tag every alert with severity (P1 / P3).** This drives the on-call rotation behaviour.
5. **Smoke-test each alert.** See "Validation" below.

## When each alert means what

### P1 alerts (page on-call)

**`bv.cb_open` stuck at 1 for > 5 min.** BlockVision is rate-limiting or 5xx-ing for sustained periods. Read tools (`balance_check`, `portfolio_analysis`) will return RPC-fallback data — non-stable USD values report as `null` and DeFi positions report as "UNAVAILABLE" instead of dollar values.
- **First-line response:** Check `/admin/scaling` for `bv.requests` tagged `result=429` vs `result=ok`. If 429-heavy → BlockVision Pro tier limit hit, contact BV support to raise quota. If 5xx-heavy → BlockVision is down, no action needed (CB will close when they recover).
- **Customer impact:** Users see partial portfolio data but no errors. Acceptable degradation.

**`navi.cb_open` stuck at 1 for > 5 min.** NAVI MCP is unavailable. `savings_info`, `health_check`, `rates_info` will return cached or stale data.
- **First-line response:** Check NAVI MCP status at `https://open-api.naviprotocol.io/api/mcp` (curl it). If 5xx → wait. If returning 429 → bump our cache TTL temporarily in `engine-factory.ts`.
- **Customer impact:** Users see slightly stale APYs / HF / savings until NAVI recovers.

### P3 alerts (Slack only — investigate next business day)

**Cache hit ratio < 0.85 over 15 min.** Either Upstash is dropping writes (rare) or some new code path is bypassing the cache.
- **First-line response:** Check the most recent deploy's diff for new `fetchAddressPortfolio` / `getPortfolio` callers that aren't routing through the cache. Check `/admin/scaling` for `upstash.requests` errors.

**Cron shard duration p99 > 4 min.** Indicates the daily fin-ctx job is approaching its 5-min Vercel budget.
- **First-line response:** If user count has grown a lot, bump `T2000_FIN_CTX_SHARD_COUNT` (currently 24) in `infra/cron-daily-intel-task-definition.json` and redeploy. Each shard handles ~30 users in 11.6s today; bumping count proportionally to active users keeps shard latency flat.

**Anthropic daily tokens exceed budget.** Either real growth (good — review pricing) or a runaway loop (bad — find the user/session and investigate).
- **First-line response:** `pnpm --filter audric-web exec prisma studio` → query `TurnMetrics` for the day, sort by `outputTokens DESC`, look at the top sessions.

**Upstash request rate > 80% monthly cap.** Cache stampede or a new code path with no TTL.
- **First-line response:** Check `/admin/scaling` for the top `upstash.requests` `prefix` tag. If one prefix dominates, investigate that store's call sites.

**Sui RPC 429 rate > 5%.** Public Sui RPC is throttling us. Acceptable up to ~10% during ecosystem mint events; sustained > 5% means we should ship PR 12 (Sui RPC pool with round-robin failover).
- **First-line response:** Note the day/time + which scenario triggered it. If sustained for > 24h, schedule PR 12.

## Validation (run once per alert when first configured)

| Alert | Manual test |
|---|---|
| `bv.cb_open` | In staging, set `BLOCKVISION_API_KEY=invalid` and trigger 10 `balance_check` calls in 5s → CB opens → wait 6 min → confirm Slack message |
| `navi.cb_open` | Same pattern with `NAVI_MCP_URL=https://invalid.example` → confirm Slack |
| Cache hit < 0.85 | Disable Upstash by setting `UPSTASH_REDIS_REST_URL=` in staging → run S2 (k6 viral burst, 20 VUs) → cache_hit drops → confirm Slack |
| Cron duration p99 > 4 min | Manually trigger ECS task with `CRON_OVERRIDE_HOUR=2` and `T2000_FIN_CTX_SHARD_COUNT=1` (forces serial) → confirm Slack |
| Anthropic budget | Wait for natural daily tick, OR set the budget temporarily to $0.01 and wait until 09:00 UTC |
| Upstash rate | Set the monthly cap temporarily to a low value in Upstash console → wait for daily tick |
| Sui RPC 429 | In staging, point `SUI_RPC_URL` to a deliberately rate-limited proxy → run S1 → confirm Slack |

After each test, **delete the staging override** so production behavior is preserved.

## What this runbook does NOT cover

- **Setting up the Slack webhook URL.** That's a one-time founder task in Slack admin.
- **On-call rotation.** Currently single-engineer; revisit when the team grows.
- **PagerDuty / Opsgenie integration.** Vercel Observability native alerts + Slack webhooks are sufficient at our scale; graduate when we have a paying ops team.
- **Custom dashboards.** `/admin/scaling` covers the founder's needs; Vercel's built-in time-series view covers historical exploration.

## Related

- `audric-scaling-spec.md` PR 5 — defined the metrics
- `audric-scaling-spec-v2.md` PR 11 — defined these alerts (parked spec; this runbook is the implementation)
- `audric/apps/web/lib/telemetry.ts` — emitter
- `audric/apps/web/app/admin/scaling/page.tsx` — current-snapshot UI
- `apps/server/src/cron/index.ts` — emits `cron.*` metrics to CloudWatch
