import type { TelemetrySink, TelemetryTags } from '@t2000/engine';

/**
 * [PR 5 — v0.56] Vercel-native telemetry sink.
 *
 * Two complementary outputs — both zero-cost on the happy path:
 *
 * 1. **Structured `console.log`** — Vercel Observability ingests any log line
 *    that JSON-parses to an object with a top-level `kind` field. We use
 *    `{ kind: 'metric', name, value, ...tags }` so the Observability tab can
 *    filter, group, and chart by name + tag combinations with a simple query.
 *    Retention: 7 days on Pro (matches our 500–1k DAU observability window).
 *
 * 2. **`@vercel/analytics` `track()`** — fires for counters with value=1
 *    (discrete events like cache hits, CB opens). Shows up in the Analytics
 *    tab alongside page-view funnels. We skip histograms and gauges here
 *    to avoid flooding the event stream with latency samples.
 *
 * This is the "Vercel-native buys us 80% of Sentry at 5% of the cost"
 * trade-off documented in the scaling spec. Graduate to Axiom/Grafana when
 * we need >30d retention, distributed traces, or on-call PagerDuty hooks.
 *
 * Why no OTel spans
 * -----------------
 * The failure modes we care about at 500–1k DAU (BV CB opening, NAVI 5xx
 * rate, cron shard failures) are answerable with "did we emit a counter in
 * the last 24h grouped by tag?" — which Vercel Observability handles natively
 * without a separate ingest pipeline or API tokens to manage.
 */

// Lazy import: @vercel/analytics is a soft dependency — the analytics
// `track()` call is best-effort and should never crash the hot path.
type TrackFn = (name: string, props?: Record<string, string | number>) => void;
let trackFn: TrackFn | null = null;

async function getTrack(): Promise<TrackFn> {
  if (trackFn !== null) return trackFn;
  try {
    const mod = await import('@vercel/analytics/server');
    trackFn = mod.track as unknown as TrackFn;
  } catch {
    trackFn = () => {}; // analytics not available (local dev, etc.)
  }
  return trackFn;
}

function serializeTags(tags?: TelemetryTags): Record<string, string | number> {
  if (!tags) return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(tags)) {
    out[k] = typeof v === 'number' ? v : String(v);
  }
  return out;
}

export class VercelTelemetrySink implements TelemetrySink {
  counter(name: string, tags?: TelemetryTags, value = 1): void {
    const serialized = serializeTags(tags);
    // Structured log — ingested by Vercel Observability
    console.log(JSON.stringify({ kind: 'metric', type: 'counter', name, value, ...serialized }));
    // Analytics track — only for value=1 discrete events to avoid flooding
    if (value === 1) {
      void getTrack().then((track) => track?.(name, serialized));
    }
  }

  gauge(name: string, value: number, tags?: TelemetryTags): void {
    const serialized = serializeTags(tags);
    console.log(JSON.stringify({ kind: 'metric', type: 'gauge', name, value, ...serialized }));
  }

  histogram(name: string, value: number, tags?: TelemetryTags): void {
    const serialized = serializeTags(tags);
    console.log(JSON.stringify({ kind: 'metric', type: 'histogram', name, value, ...serialized }));
  }
}
