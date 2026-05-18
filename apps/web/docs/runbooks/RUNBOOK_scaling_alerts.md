# Runbook: Scaling alerts

> **STATUS: DEFERRED (2026-04-29).** PR 11 of the audric-scaling-spec was scoped against an incorrect assumption that Vercel Observability supports custom-metric alerts on log-field counters (it doesn't — the product only supports Error Anomaly + Usage Anomaly on built-in metrics, and the Slack destination is an OAuth-installed app, not a paste-your-webhook-URL field). This runbook is preserved as the **alert specification** (thresholds + severity + response playbook). The implementation was deferred until scaling v2 wakes up. See "Implementation when we resume" at the bottom.
>
> In the meantime: `/admin/scaling` (founder-only, uses `T2000_INTERNAL_KEY`) is the current alert surface. Manual daily check is fine at our load (~165 active users, comfortable headroom on every metric).

**Goal:** Make the metrics shipped in PR 5 of the audric-scaling-spec actionable. Without alerts, a 90% → 60% cache hit drop (or a circuit breaker stuck open) goes unnoticed until a user complains.

**Where the metrics live.** Three surfaces:
1. Audric Vercel logs — the `kind=metric` JSON lines
2. ECS CloudWatch logs — the daily cron emits the same JSON shape (filter pattern `{ $.kind = "metric" && $.name = "cron.*" }`)
3. `/admin/scaling` (founder-only, uses `T2000_INTERNAL_KEY`) — current snapshot

**Notification channel (when we ship the implementation).** Discord — already the established alert surface for this org (see `DISCORD_RELEASES_WEBHOOK` + `DISCORD_DEVLOG_WEBHOOK` in `.github/workflows/`). Implementation will reuse the same `{ embeds }` payload shape via a new `DISCORD_ALERTS_WEBHOOK` env var.

## Alerts to configure

| Alert | Threshold | Severity | Destination |
|---|---|---|---|
| `bv.cb_open` gauge stays at 1 for > 5 min | 5 min | P1 — page on-call | Discord `#audric-alerts` + email |
| `navi.cb_open` gauge stays at 1 for > 5 min | 5 min | P1 — page on-call | Discord `#audric-alerts` + email |
| `bv.cache_hit / bv.requests` ratio drops below 0.85 over 15 min window | 15 min | P3 — Discord only | Discord `#audric-alerts` |
| `cron.fin_ctx_shard_duration_ms` p99 > 240,000ms (4 min — 80% of the 5min budget) | per-run | P3 — Discord only | Discord `#audric-alerts` |
| `anthropic.tokens` daily counter exceeds budget ($150 USD/day) | daily 09:00 UTC | P3 — email | Email |
| `upstash.requests` rate exceeds 80% of monthly cap (Pay-as-you-go: 500K/day) | daily | P3 — email | Email |
| `sui_rpc.requests` 429-tagged rate > 5% over 10 min window | 10 min | P3 — Discord only | Discord `#audric-alerts` |

## Implementation when we resume

The right path is a self-built relay (~50 lines) — Vercel's built-in alerting doesn't reach our custom counters, and adding a third-party observability vendor is overkill at our scale.

**Components to build:**

1. **`audric/apps/web/app/api/cron/scaling-alerts/route.ts`** — Vercel cron route, runs every 5 min via `vercel.json`.
   - Reads counter / gauge state from `lib/telemetry.ts` (in-process snapshot or Upstash-stored, depending on persistence model — check what `/admin/scaling` reads at the time of implementation).
   - Evaluates each of the 7 thresholds in the alerts table below.
   - For any breach, POSTs to `DISCORD_ALERTS_WEBHOOK` with a Discord `{ embeds }` payload (reuse the format from `.github/workflows/publish.yml` — colour-coded by severity, link to `/admin/scaling`).
   - Idempotent dedup: track last-fired-at per alert in Upstash (TTL = severity-dependent, e.g. P1 every 30 min, P3 every 4 h) so we don't spam the channel during sustained breaches.

2. **`audric/apps/web/lib/env.ts`** — add `DISCORD_ALERTS_WEBHOOK` as an optional env var (warns at boot if missing in production, doesn't fail-fast since alerts are non-critical).

3. **`audric/apps/web/vercel.json`** — add cron entry: `{ "path": "/api/cron/scaling-alerts", "schedule": "*/5 * * * *" }`. Auth via existing `CRON_SECRET` Bearer header.

4. **Discord webhook setup:**
   - Discord server → pick or create `#audric-alerts` channel (separate from `#releases` and `#devlog` so noise levels don't bleed)
   - Channel settings → Integrations → Webhooks → New Webhook → name "Audric Scaling Alerts" → Copy URL
   - Add to Vercel env as `DISCORD_ALERTS_WEBHOOK` (production scope only — keep dev/preview noise out)
   - Sanity test:
     ```
     curl -H "Content-Type: application/json" \
       -d '{"content":"test from runbook setup"}' \
       "https://discord.com/api/webhooks/<id>/<token>"
     ```

5. **Effort:** ~3 hours to build + test the cron route, plus ~10 min to wire the Discord webhook.

**Why we deferred:** Scaling v2 (PRs 8–13) is parked until after the sui-cli refactor + USDC sponsorship simplification. At our current load (~165 active users), `/admin/scaling` checked manually once a day is fine. Setting up alerts for a system not under load is premature optimization. Revisit when scaling v2 wakes up.

## When each alert means what

### P1 alerts (page on-call)

**`bv.cb_open` stuck at 1 for > 5 min.** BlockVision is rate-limiting or 5xx-ing for sustained periods. Read tools (`balance_check`, `portfolio_analysis`) will return RPC-fallback data — non-stable USD values report as `null` and DeFi positions report as "UNAVAILABLE" instead of dollar values.
- **First-line response:** Check `/admin/scaling` for `bv.requests` tagged `result=429` vs `result=ok`. If 429-heavy → BlockVision Pro tier limit hit, contact BV support to raise quota. If 5xx-heavy → BlockVision is down, no action needed (CB will close when they recover).
- **Customer impact:** Users see partial portfolio data but no errors. Acceptable degradation.

**`navi.cb_open` stuck at 1 for > 5 min.** NAVI MCP is unavailable. `savings_info`, `health_check`, `rates_info` will return cached or stale data.
- **First-line response:** Check NAVI MCP status at `https://open-api.naviprotocol.io/api/mcp` (curl it). If 5xx → wait. If returning 429 → bump our cache TTL temporarily in `engine-factory.ts`.
- **Customer impact:** Users see slightly stale APYs / HF / savings until NAVI recovers.

### P3 alerts (Discord only — investigate next business day)

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

## Validation when we ship the implementation (one per alert)

Each test below should produce a Discord message in the alerts channel within one cron tick (5 min).

| Alert | Manual test |
|---|---|
| `bv.cb_open` | In staging, set `BLOCKVISION_API_KEY=invalid` and trigger 10 `balance_check` calls in 5s → CB opens → wait 6 min → confirm Discord message |
| `navi.cb_open` | Same pattern with `NAVI_MCP_URL=https://invalid.example` → confirm Discord |
| Cache hit < 0.85 | Disable Upstash by setting `UPSTASH_REDIS_REST_URL=` in staging → run S2 (k6 viral burst, 20 VUs) → cache_hit drops → confirm Discord |
| Cron duration p99 > 4 min | Manually trigger ECS task with `CRON_OVERRIDE_HOUR=2` and `T2000_FIN_CTX_SHARD_COUNT=1` (forces serial) → confirm Discord |
| Anthropic budget | Wait for natural daily tick, OR set the budget temporarily to $0.01 and wait until 09:00 UTC |
| Upstash rate | Set the monthly cap temporarily to a low value in Upstash console → wait for daily tick |
| Sui RPC 429 | In staging, point `SUI_RPC_URL` to a deliberately rate-limited proxy → run S1 → confirm Discord |

After each test, **delete the staging override** so production behavior is preserved.

## What this runbook does NOT cover

- **On-call rotation.** Currently single-engineer; revisit when the team grows.
- **PagerDuty / Opsgenie integration.** A self-built relay + Discord webhook is sufficient at our scale; graduate when we have a paying ops team.
- **Custom dashboards.** `/admin/scaling` covers the founder's needs; Vercel's built-in time-series view covers historical exploration.
- **Built-in Vercel anomaly alerts.** Vercel does support Error Anomaly + Usage Anomaly natively (Settings → Alerts → Add Rule). These cover ~2 of the 7 things in our table as proxies (function-invocation spikes for cron timeout, error rate for cb_open) and require zero code. Worth turning on independently of this runbook — but they don't replace the custom-metric alerts described here.

## Related

- `audric-scaling-spec.md` PR 5 — defined the metrics
- `audric-scaling-spec-v2.md` PR 11 — defined these alerts (parked spec; this runbook is the implementation)
- `audric/apps/web/lib/telemetry.ts` — emitter
- `audric/apps/web/app/admin/scaling/page.tsx` — current-snapshot UI
- `apps/server/src/cron/index.ts` — emits `cron.*` metrics to CloudWatch
