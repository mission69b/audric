import { getTelemetrySink } from '@t2000/engine';

/**
 * [S.126 Tier 1 / 2026-05-09] Latency telemetry for the sponsored-transaction
 * round-trip — `/api/transactions/prepare` and `/api/transactions/execute`.
 *
 * Why this exists. S.124's manual smoke surfaced 60-80s perceived latency
 * for write ops on production. Existing telemetry covers the SDK + LLM side
 * (`swap_compose_duration_ms`, `bundle_compose_duration_ms`, `engine.turn_duration_ms`,
 * `audric.engine.chat_stream_duration_ms`) but the two transaction routes
 * are black boxes — once the engine yields a `pending_action` and the user
 * taps Confirm, we lose all server-side visibility until the next chat turn
 * fires. The 60-80s "execute black box" we observed in production logs has
 * no diagnostic anchor: it could be Enoki, our `waitForTransaction` polling,
 * post-write balance refresh, or any combination.
 *
 * This module fills that gap with five histograms + two counters:
 *
 *   - `audric.txn.prepare_duration_ms`   — full prepare route handler
 *   - `audric.txn.enoki_sponsor_ms`      — just the Enoki `/sponsor` round-trip
 *   - `audric.txn.execute_duration_ms`   — full execute route handler
 *   - `audric.txn.enoki_execute_ms`      — just the Enoki `/sponsor/{digest}` round-trip
 *   - `audric.txn.sui_wait_ms`           — `suiClient.waitForTransaction` duration
 *   - `audric.txn.prepare_outcome_count` — counter, tagged by outcome
 *   - `audric.txn.execute_outcome_count` — counter, tagged by outcome
 *
 * Tag dimensions kept minimal:
 *   - `txType`: which transaction type (single op like 'swap' / 'send' / 'save', or 'bundle')
 *   - `outcome`: success / sponsor_error / execute_error / session_expired / wait_timeout
 *
 * Step count is intentionally NOT a tag for txn metrics — bundles already
 * have their own dedicated metrics in `bundle-metrics.ts`. This module is
 * about the route-level latency, not bundle composition cost.
 *
 * Mirrors the `bundle-metrics.ts` pattern exactly: try/catch wrap so
 * telemetry can never block the request, fire-and-forget, named in the
 * `audric.*` namespace so it joins the existing dashboard.
 */
const NAMESPACE = 'audric.txn';

export type TxnOutcome =
  | 'success'
  | 'compose_error'
  | 'sponsor_error'
  | 'execute_error'
  | 'session_expired'
  | 'wait_error';

export function emitPrepareDuration(args: {
  txType: string;
  durationMs: number;
  outcome: TxnOutcome;
}): void {
  try {
    const sink = getTelemetrySink();
    sink.histogram(`${NAMESPACE}.prepare_duration_ms`, args.durationMs, {
      txType: args.txType,
      outcome: args.outcome,
    });
    sink.counter(`${NAMESPACE}.prepare_outcome_count`, {
      txType: args.txType,
      outcome: args.outcome,
    });
  } catch {
    // Telemetry must never block the request.
  }
}

export function emitExecuteDuration(args: {
  durationMs: number;
  outcome: TxnOutcome;
}): void {
  try {
    const sink = getTelemetrySink();
    sink.histogram(`${NAMESPACE}.execute_duration_ms`, args.durationMs, {
      outcome: args.outcome,
    });
    sink.counter(`${NAMESPACE}.execute_outcome_count`, {
      outcome: args.outcome,
    });
  } catch {
    // Telemetry must never block the request.
  }
}

/**
 * Just the Enoki `/transaction-blocks/sponsor` POST round-trip latency.
 * This is the time Enoki takes to validate, dry-run, and return the
 * sponsored intent — separate from our compose time (which is already
 * measured via `swap_compose_duration_ms` / `bundle_compose_duration_ms`).
 *
 * If `enoki_sponsor_ms` ≈ `prepare_duration_ms`, the bottleneck is Enoki.
 * If they diverge, the gap is in our compose / validate / response code.
 */
export function emitEnokiSponsorDuration(args: {
  txType: string;
  durationMs: number;
  ok: boolean;
}): void {
  try {
    getTelemetrySink().histogram(`${NAMESPACE}.enoki_sponsor_ms`, args.durationMs, {
      txType: args.txType,
      ok: args.ok ? 'true' : 'false',
    });
  } catch {
    // Telemetry must never block the request.
  }
}

/**
 * Just the Enoki `/transaction-blocks/sponsor/{digest}` POST round-trip
 * latency (the execute call where Enoki co-signs and submits). Distinct
 * from `sui_wait_ms` which is the post-submit checkpoint wait.
 */
export function emitEnokiExecuteDuration(args: {
  durationMs: number;
  ok: boolean;
}): void {
  try {
    getTelemetrySink().histogram(`${NAMESPACE}.enoki_execute_ms`, args.durationMs, {
      ok: args.ok ? 'true' : 'false',
    });
  } catch {
    // Telemetry must never block the request.
  }
}

/**
 * `suiClient.waitForTransaction` duration. This is THE prime suspect for
 * the 60-80s "execute black box" — `waitForTransaction` polls Sui RPC
 * until the digest appears in a confirmed checkpoint. Under network or
 * RPC slowness it can hang significantly longer than typical Sui
 * checkpoint cadence (~0.5-2s).
 *
 * If `sui_wait_ms` p95 > 5s, the bottleneck is checkpoint settlement OR
 * the RPC endpoint we're polling. Both have known mitigations
 * (RPC failover, request `effects` only and skip `objectChanges`, etc.)
 * but we need the data first.
 */
export function emitSuiWaitDuration(args: {
  durationMs: number;
  ok: boolean;
}): void {
  try {
    getTelemetrySink().histogram(`${NAMESPACE}.sui_wait_ms`, args.durationMs, {
      ok: args.ok ? 'true' : 'false',
    });
  } catch {
    // Telemetry must never block the request.
  }
}
