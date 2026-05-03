import { getTelemetrySink } from '@t2000/engine';

/**
 * SPEC 7 P2.7 — Bundle telemetry helpers (the 48h soak instrumentation).
 *
 * Three load-bearing metrics from `spec/SPEC_7_MULTI_WRITE_PTB.md` § "Suggested
 * next steps" P2.7 ramp note. Without these we can't tell whether a silent
 * regression has crept into Payment Stream production traffic — bundles are
 * already 100%-live (the spec'd `NEXT_PUBLIC_PAYMENT_STREAM_ENABLED` flag was
 * deferred during P2.2c because the migration was functionally equivalent),
 * so monitoring is the safety net the flag was supposed to provide.
 *
 * Mirrors the `audric.harness.regenerate_count` shape the regenerate route
 * established under P2.4b — one counter per discriminator (`outcome`),
 * fire-and-forget, wrapped in try/catch so telemetry can never block a write.
 *
 * Why we stay in the `audric.harness.*` namespace (and not invent
 * `audric.spec7.*`): the harness dashboard already filters on this prefix
 * for `regenerate_count` + SPEC 8 metrics. Splitting Payment Stream into a
 * sibling namespace would force a second dashboard or a wildcard query.
 * The spec mentioned `audric.spec7.*` aspirationally; nothing else uses it.
 */
const NAMESPACE = 'audric.harness';

/**
 * Outcome enum for `bundle_outcome_count`. Five terminal states; covers
 * every bundle disposition we care about for the 48h soak. Not exhaustive
 * for `denied` (deferred — client-side path doesn't reliably have a sink
 * installed; if soak data shows we need it, add a thin telemetry endpoint
 * later).
 */
export type BundleOutcome =
  | 'executed'
  | 'reverted'
  | 'compose_error'
  | 'sponsorship_failed';

interface ProtocolFlags {
  hasSwap: boolean;
  hasNavi: boolean;
  hasTransfer: boolean;
  hasVolo: boolean;
}

/**
 * Tag the bundle with which protocols it touched. Dashboards can split
 * revert rates by protocol (e.g. "is the regression Cetus-only or
 * NAVI-only?") which is the first triage cut when revert rate spikes.
 *
 * Forward-compat: a tool added after this module ships flags as no protocol
 * (all four flags `false`). That's a useful signal — surfaces the new tool
 * in the dashboard as "untagged bundles," telegraphs that this helper
 * needs an update.
 */
function classifyProtocols(steps: ReadonlyArray<{ toolName: string }>): ProtocolFlags {
  const names = new Set(steps.map((s) => s.toolName));
  return {
    hasSwap: names.has('swap_execute'),
    hasNavi:
      names.has('save_deposit') ||
      names.has('withdraw') ||
      names.has('borrow') ||
      names.has('repay_debt') ||
      names.has('claim_rewards'),
    hasTransfer: names.has('send_transfer'),
    hasVolo: names.has('volo_stake') || names.has('volo_unstake'),
  };
}

/**
 * Fires once per multi-step `pending_action` emission. Measures LLM intent
 * rate (independent of whether the user later approves / denies). Combined
 * with `bundle_outcome_count`, gives us:
 *
 *   - Bundle proposal rate = bundle_proposed_count / total_pending_action
 *   - Bundle execution rate = bundle_outcome_count{executed} / bundle_proposed_count
 *
 * Single-step pending_actions (steps.length < 2) intentionally don't fire —
 * they're already covered by the existing per-tool telemetry (e.g.
 * `audric.harness.regenerate_count`) and the spec calls out bundles
 * specifically as the new measurement surface.
 */
export function emitBundleProposed(steps: ReadonlyArray<{ toolName: string }>): void {
  if (steps.length < 2) return;
  try {
    const flags = classifyProtocols(steps);
    getTelemetrySink().counter(`${NAMESPACE}.bundle_proposed_count`, {
      stepCount: steps.length,
      hasSwap: flags.hasSwap ? 'true' : 'false',
      hasNavi: flags.hasNavi ? 'true' : 'false',
      hasTransfer: flags.hasTransfer ? 'true' : 'false',
      hasVolo: flags.hasVolo ? 'true' : 'false',
    });
  } catch {
    // Telemetry must never block the request.
  }
}

/**
 * Single counter with an `outcome` discriminator gives us the soak's
 * load-bearing decision metric: revert_rate = (reverted + compose_error +
 * sponsorship_failed) / (executed + reverted + compose_error +
 * sponsorship_failed).
 *
 * The decision matrix in `spec/runbooks/RUNBOOK_spec7_p27_ramp.md`:
 *   - revert_rate < 1%   → close SPEC 7 at T+48h
 *   - revert_rate 1-5%   → investigate before close
 *   - revert_rate > 5%   → break-glass disable (NEXT_PUBLIC_PAYMENT_STREAM_DISABLE)
 *
 * Breaking out `compose_error` vs `sponsorship_failed` matters because they
 * point at different failure surfaces — local PTB build (our code) vs
 * Enoki dry-run rejection (transaction would have reverted on-chain). A
 * spike in compose_error implicates a recent SDK change; a spike in
 * sponsorship_failed implicates Enoki, our `allowedAddresses` derivation,
 * or genuine on-chain semantics regression.
 */
export function emitBundleOutcome(args: {
  outcome: BundleOutcome;
  stepCount: number;
  reason?: string;
  statusCode?: number;
}): void {
  try {
    const tags: Record<string, string | number> = {
      outcome: args.outcome,
      stepCount: args.stepCount,
    };
    if (args.reason) tags.reason = args.reason;
    if (args.statusCode !== undefined) tags.statusCode = args.statusCode;
    getTelemetrySink().counter(`${NAMESPACE}.bundle_outcome_count`, tags);
  } catch {
    // Telemetry must never block the request.
  }
}

/**
 * Histograms `composeTx(...)` wall-clock duration. Doesn't drive the close
 * decision but guards against a slow regression: if Cetus's provider list
 * grows, multi-leg swap bundles could push the Enoki sponsor request
 * payload past size limits or timeout. Watching p99 here gives us early
 * warning before users see "compose timeout" errors.
 */
export function emitBundleComposeDuration(stepCount: number, durationMs: number): void {
  try {
    getTelemetrySink().histogram(`${NAMESPACE}.bundle_compose_duration_ms`, durationMs, {
      stepCount,
    });
  } catch {
    // Telemetry must never block the request.
  }
}

/**
 * [Backlog 2a-bis / 2026-05-04] Server-side swap-build latency for the
 * Backlog 2b decision gate.
 *
 * Why this exists separately from `bundle_compose_duration_ms`:
 *   - `bundle_compose_duration_ms` only fires for bundles (steps ≥ 2). It
 *     misses the most common swap shape (single-step "swap 1 USDC to SUI").
 *   - Engine-side `cetus.swap_execute_total_ms` (instrumented in
 *     `packages/engine/src/tools/swap.ts`) is dead code in audric's prod
 *     path: confirm-tier writes are dispatched through `/api/transactions/
 *     prepare` which calls `composeTx` directly, never going through the
 *     engine tool's `call()` method. The engine metric only fires from
 *     non-audric hosts (CLI today) — useful for those, but doesn't tell us
 *     anything about audric's actual production swap latency.
 *
 * Fires on every `composeTx` call where `hasSwap === true`, regardless of
 * step count. Tag with `step_count` so dashboards can split:
 *   - `step_count=1, has_swap=true`  → pure single-swap server-side cost
 *   - `step_count≥2, has_swap=true`  → bundle-with-swap server-side cost
 *
 * Outcome tag matches the existing `emitBundleOutcome` semantics:
 *   - `success`: composeTx returned a built tx
 *   - `compose_error`: composeTx threw locally (SDK regression / bad input)
 *
 * Sponsorship_failed is NOT a compose-side outcome — by the time we see it,
 * composeTx already succeeded. Caller must emit `success` even when the
 * subsequent Enoki call fails.
 *
 * Pairs with engine-side `cetus.find_route_ms` (route fetch in `swap_quote`)
 * to compute "what fraction of swap_execute server cost is route fetch?"
 * — the upper bound on what a per-request route cache (Backlog 2b) saves.
 */
export function emitSwapComposeDuration(args: {
  stepCount: number;
  durationMs: number;
  outcome: 'success' | 'compose_error';
}): void {
  try {
    const sink = getTelemetrySink();
    sink.histogram(`${NAMESPACE}.swap_compose_duration_ms`, args.durationMs, {
      stepCount: args.stepCount,
      outcome: args.outcome,
    });
    sink.counter(`${NAMESPACE}.swap_compose_count`, {
      stepCount: args.stepCount,
      outcome: args.outcome,
    });
  } catch {
    // Telemetry must never block the request.
  }
}
