/**
 * Fast-path bundle dispatcher (SPEC 14 Phase 2)
 *
 * When the chat route receives a short affirmative reply ("Confirm",
 * "Yes", "go ahead") AND there's a fresh `prepare_bundle` proposal
 * stashed in Redis for this session, this module:
 *
 *   1. Reads + atomically consumes the stash.
 *   2. Stamps per-step `attemptId`s + `toolUseId`s.
 *   3. Builds a structurally-valid `PendingAction` with `steps[]`.
 *   4. Returns it for the chat route to yield as a `pending_action`
 *      SSE event WITHOUT round-tripping the LLM.
 *
 * This is the SPEC 14 fix for the load-bearing-LLM-emission-timing
 * problem. The bundle invariant (every write in ONE assistant message)
 * was the failure mode of `1.14.0 → 1.14.3` — four prompt-level
 * attempts to coerce LLM behavior, each with its own escape hatch.
 * The fast path eliminates the LLM from confirm turns entirely, so
 * the bundle is committed at PLAN time (the `prepare_bundle` call)
 * and merely DISPATCHED at confirm time.
 *
 * Cross-references:
 *   - `prepare-bundle-tool.ts` — the LLM-callable plan-time tool that
 *     populates the stash.
 *   - `bundle-proposal-store.ts` — Upstash Redis CRUD with 60s TTL.
 *   - `confirm-detection.ts:isAffirmativeConfirmReply` — the same
 *     regex the Haiku promotion path uses.
 *   - `app/api/engine/chat/route.ts` — the lone caller.
 */

import { randomUUID } from 'node:crypto';
import type { ContentBlock, Message, PendingAction, PendingActionStep } from '@t2000/engine';
import { getTelemetrySink } from '@t2000/engine';
import {
  detectPriorPlanContext,
  isAffirmativeConfirmReply,
  looksLikeNegativeReply,
} from './confirm-detection';
import {
  consumeBundleProposal,
  type BundleProposal,
  type BundleProposalStep,
} from './bundle-proposal-store';

interface FastPathConsumeOpts {
  sessionId: string | undefined;
  walletAddress: string | undefined;
  trimmedMessage: string;
  turnIndex: number;
  /**
   * [SPEC 15 Phase 1.5] Conversation history up to (but NOT including)
   * the current user message. Used by `detectPriorPlanContext` to
   * admit the fast path on plan-context-confirmed turns even when the
   * strict regex (`isAffirmativeConfirmReply`) misses.
   *
   * Optional for backward-compat — when omitted, behavior is the
   * legacy regex-only admission (no plan-context override).
   */
  history?: Message[];
  /**
   * [SPEC 15 Phase 2] Override the intent-check gates. Set by the chat
   * route when the user clicked the Confirm chip — chip click is a
   * 100% intent signal, so we skip the regex / plan-context / negative-
   * reply checks entirely.
   *
   * **What this skips:** `isAffirmativeConfirmReply`,
   * `looksLikeNegativeReply`, `detectPriorPlanContext`.
   *
   * **What this DOES NOT skip:** session-validity (sessionId,
   * walletAddress), stash existence (`consumeBundleProposal` returning
   * null → `no_stash`), wallet-mismatch (proposal.walletAddress vs
   * request walletAddress). Chip is an intent signal but NOT a
   * session-state signal — a chip click against an expired stash or
   * a different wallet should still skip cleanly with the matching
   * `recordSkip` reason.
   *
   * Tagged on the dispatch counter as `admitted_via='chip'`.
   */
  forceAdmit?: 'chip';
}

/**
 * How the fast path decided to admit this turn.
 *
 *   - 'regex': strict `CONFIRM_PATTERN` match (Phase 1 baseline).
 *     Maintains the 108ms bypass on the canonical happy path.
 *   - 'plan_context': regex missed, but the prior assistant turn was
 *     a multi-write Payment Stream plan AND the user's reply isn't
 *     clearly negative. SPEC 15 Phase 1.5 — catches "do it bro" /
 *     "vamos" / voice transcripts / non-English confirms that the
 *     regex would otherwise drop into LLM re-planning (which
 *     decomposes bundles — see 04:31 prod regression report).
 *   - 'chip': SPEC 15 Phase 2. The user clicked the Confirm chip.
 *     Chip click is a 100% intent signal — no regex, no plan-context
 *     match, no language guesswork. The chat route signals this via
 *     `FastPathConsumeOpts.forceAdmit='chip'`. Session-validity, stash
 *     existence, and wallet-match checks still run.
 */
/**
 * Exported (not just internal) so callers can tag downstream telemetry
 * accurately. SPEC 15 Phase 2's chat-route emits
 * `audric.confirm_flow.dispatch_count{admitted_via=...}` and needs the
 * exact admission cause — without this export it would have to coarse-
 * grain 'regex' / 'plan_context' as a single 'text' bucket.
 */
export type AdmittedVia = 'regex' | 'plan_context' | 'chip';

interface FastPathHit {
  /** Constructed bundle, ready to enqueue as `pending_action` SSE. */
  action: PendingAction;
  /** Original stashed proposal — handy for telemetry + post-emit logs. */
  proposal: BundleProposal;
  /**
   * Synthetic assistant text the chat route should append to the
   * engine's message ledger so chat history stays coherent. Without
   * this, the user's "Confirm" lands in session.messages with no
   * matching assistant turn, which breaks (a) the chat-history UI and
   * (b) the next turn's LLM prompt (it sees a hanging plan turn).
   *
   * Intentionally text-only — NOT a synthesised tool_use block. The
   * tool_use block lives on `action.steps[].toolUseId` for the
   * downstream `composeTx` call; the LEDGER message is just a human-
   * readable acknowledgment of the bundle.
   */
  syntheticAssistantText: string;
  /**
   * [SPEC 15 Phase 2] How this hit was admitted, surfaced so callers
   * can tag the `audric.confirm_flow.dispatch_count` counter with the
   * precise admission cause (chip / regex / plan_context). The
   * function-internal counter (`audric.bundle.fast_path_dispatched`)
   * already has this tag, but exposing it here lets the chat route
   * avoid coarse-graining text dispatches when emitting the new
   * confirm-flow counter.
   */
  admittedVia: AdmittedVia;
}

/**
 * Reason the fast path declined. Surfaces as the `reason` label on
 * `audric.bundle.fast_path_skipped`. Helps us tell apart the
 * legitimate "no-stash" steady state from misuse cases (wallet
 * mismatch, expired) that need investigation.
 *
 * Phase 1.5 additions:
 *   - 'negative_reply': user said something that looks negative (no /
 *     wait / cancel / actually / change…). Plan-context was detected,
 *     but the user is clearly not confirming. Skipping is correct —
 *     LLM picks up the turn and handles modifications/cancellations.
 *   - 'no_plan_context': regex missed AND prior turn isn't a
 *     multi-write plan. Reduces ambiguity in dashboards by separating
 *     "user typed gibberish on a plan turn" from "user typed
 *     something on a non-plan turn" (the latter is the legit steady-
 *     state of every non-confirm chat message).
 */
type SkipReason =
  | 'no_session'
  | 'no_wallet'
  | 'not_affirmative'
  | 'no_plan_context'
  | 'negative_reply'
  | 'no_stash'
  | 'wallet_mismatch';

function recordSkip(reason: SkipReason): null {
  getTelemetrySink().counter('audric.bundle.fast_path_skipped', { reason });
  return null;
}

/**
 * Per-step user-facing description. Mirrors `describeAction` in
 * `@t2000/engine/src/describe-action.ts` (which isn't exported from
 * the engine's public surface). Behavior MUST stay close to the
 * engine-side version — when the engine bumps to expose
 * `describeAction`, swap this for an import.
 *
 * TODO(SPEC 14 Phase 3): switch to `import { describeAction } from
 * '@t2000/engine'` once engine ≥ 1.15 ships that export.
 */
function describeStep(step: BundleProposalStep): string {
  const i = step.input;
  const amount = i.amount as number | string | undefined;
  const asset = (i.asset as string | undefined) ?? 'USDC';
  switch (step.toolName) {
    case 'withdraw':
      return amount !== undefined
        ? `Withdraw ${amount} ${asset} from savings`
        : `Withdraw all ${asset} from savings`;
    case 'save_deposit':
      return amount !== undefined
        ? `Save ${amount} ${asset} into lending`
        : `Save ${asset} into lending`;
    case 'borrow':
      return `Borrow ${amount ?? '?'} ${asset}`;
    case 'repay_debt':
      return `Repay ${amount ?? '?'} ${asset}`;
    case 'send_transfer': {
      const to = i.to as string | undefined;
      return `Send ${amount ?? '?'} ${asset} to ${to ?? '?'}`;
    }
    case 'swap_execute': {
      const from = i.from as string | undefined;
      const to = i.to as string | undefined;
      return `Swap ${amount ?? '?'} ${from ?? '?'} → ${to ?? '?'}`;
    }
    case 'claim_rewards':
      return 'Claim NAVI rewards';
    case 'volo_stake':
      return `Stake ${amount ?? '?'} SUI → vSUI`;
    case 'volo_unstake':
      return `Unstake ${amount ?? '?'} vSUI → SUI`;
    default:
      return step.toolName;
  }
}

/**
 * Construct a structurally-valid `PendingAction` from a stashed
 * proposal. Mirrors what `composeBundleFromToolResults` in the engine
 * produces for a multi-write bundle, minus the LLM-derived fields
 * (assistantContent, completedResults, regenerateInput) — those are
 * irrelevant for the fast path because there was no LLM turn to
 * regenerate from and no read tool_use ids to track.
 *
 * Conventions matched:
 *   - `steps[i].toolUseId` uses a deterministic prefix `fastpath_` so
 *     log analysis can tell apart fast-path vs legacy bundles by
 *     prefix alone.
 *   - `steps[i].attemptId` is a fresh UUID v4 per step (engine spec).
 *   - Top-level `toolName/toolUseId/input/description/attemptId`
 *     mirror `steps[0]` (per SPEC 7 Layer 2 line 463).
 */
function buildPendingActionFromProposal(
  proposal: BundleProposal,
  turnIndex: number,
): PendingAction {
  const steps: PendingActionStep[] = proposal.steps.map((s, i) => {
    const step: PendingActionStep = {
      toolName: s.toolName,
      toolUseId: `fastpath_${proposal.bundleId}_${i}`,
      attemptId: randomUUID(),
      input: s.input,
      description: describeStep(s),
    };
    if (s.inputCoinFromStep !== undefined) {
      step.inputCoinFromStep = s.inputCoinFromStep;
    }
    return step;
  });

  const first = steps[0];

  // assistantContent on a real LLM-emitted bundle holds the LLM's
  // tool_use blocks for each write. The fast path has no LLM turn, so
  // we leave it empty. Downstream consumers (composeTx, the resume
  // route) read `steps[]` directly — they don't depend on
  // assistantContent.
  const assistantContent: ContentBlock[] = [];

  return {
    toolName: first.toolName,
    toolUseId: first.toolUseId,
    input: first.input,
    description: first.description,
    assistantContent,
    completedResults: [],
    turnIndex,
    attemptId: first.attemptId,
    steps,
  };
}

/**
 * Try the fast path for the current chat turn. Returns null when:
 *   - sessionId or walletAddress is missing
 *   - the user's message is neither an affirmative confirm nor a
 *     plan-context-eligible reply (Phase 1.5) — UNLESS forceAdmit='chip'
 *     overrides the intent gates (Phase 2)
 *   - no fresh proposal is stashed for this session
 *   - the stash's wallet doesn't match the current request's wallet
 *
 * Admission has three paths (checked in order):
 *
 *   1. **Chip override** (Phase 2): caller passes `forceAdmit='chip'`.
 *      Skips intent checks entirely. Tag: `admitted_via=chip`.
 *      Session/stash/wallet checks still run (a chip click against an
 *      expired stash or wrong wallet should still skip cleanly).
 *
 *   2. **Strict regex** (`isAffirmativeConfirmReply`): "yes" / "Confirm" /
 *      "execute" / etc. Matches the 108 ms canonical happy path.
 *      Tag: `admitted_via=regex`.
 *
 *   3. **Plan-context override** (Phase 1.5): the regex missed, but the
 *      prior assistant turn is a multi-write Payment Stream plan AND
 *      the user's reply isn't clearly negative. Catches "do it bro" /
 *      "vamos" / voice transcripts / multilingual confirms that
 *      otherwise drop into LLM re-planning (which decomposes bundles —
 *      the 04:31 prod regression). Tag: `admitted_via=plan_context`.
 *
 * Each null path increments `audric.bundle.fast_path_skipped` with
 * a `reason` label. The successful path increments
 * `audric.bundle.fast_path_dispatched` with `step_count` and
 * `admitted_via` so dashboards can split by admission cause.
 */
export async function tryConsumeFastPathBundle(
  opts: FastPathConsumeOpts,
): Promise<FastPathHit | null> {
  if (!opts.sessionId) return recordSkip('no_session');
  if (!opts.walletAddress) return recordSkip('no_wallet');

  let admittedVia: AdmittedVia | null = null;
  if (opts.forceAdmit === 'chip') {
    // [Phase 2] Chip override. Skip ALL intent gates — chip is a 100%
    // signal. Session/stash/wallet gates below still apply (chip click
    // against expired stash → no_stash; against wrong wallet →
    // wallet_mismatch).
    admittedVia = 'chip';
  } else if (isAffirmativeConfirmReply(opts.trimmedMessage)) {
    admittedVia = 'regex';
  } else if (opts.history && opts.history.length > 0) {
    // [Phase 1.5] Plan-context override. Only fire when the prior
    // assistant turn was a multi-write plan — never on a cold session.
    if (looksLikeNegativeReply(opts.trimmedMessage)) {
      // User clearly isn't confirming (typed "no" / "wait" / "cancel"
      // / "actually let me reconsider" / etc). Skip — let the LLM
      // handle the modification/cancellation. Plan-context promotion
      // (Phase 1) ensures Sonnet gets the turn instead of Haiku-lean.
      return recordSkip('negative_reply');
    }
    if (detectPriorPlanContext(opts.history).matched) {
      admittedVia = 'plan_context';
    }
  }
  if (admittedVia === null) {
    // Either the regex missed AND no history was provided (legacy
    // call site, would-be `not_affirmative` under Phase 1), OR the
    // history shows no multi-write plan. Distinguishing the two
    // makes dashboards easier to read — `not_affirmative` should be
    // close-to-zero post-Phase-1.5; `no_plan_context` is the steady
    // state for every non-confirm chat message.
    if (opts.history && opts.history.length > 0) {
      return recordSkip('no_plan_context');
    }
    return recordSkip('not_affirmative');
  }

  const proposal = await consumeBundleProposal(opts.sessionId);
  if (!proposal) return recordSkip('no_stash');

  if (proposal.walletAddress !== opts.walletAddress) {
    return recordSkip('wallet_mismatch');
  }

  const action = buildPendingActionFromProposal(proposal, opts.turnIndex);

  getTelemetrySink().counter('audric.bundle.fast_path_dispatched', {
    step_count: String(proposal.steps.length),
    admitted_via: admittedVia,
  });

  return {
    action,
    proposal,
    // [SPEC 14 Phase 2 — May 3 prod soak] The synthetic ack must be
    // temporally unambiguous. By the time the resume route's narration
    // LLM sees this message, the bundle has already settled on-chain
    // and `postWriteRefresh` has injected balance_check + savings_info
    // tool_use blocks INTO this same assistant message. A
    // forward-looking "Compiling..." text confuses the model because
    // it sees no record of the actual write tool_use blocks (those
    // went through the sponsored-tx flow, not the engine) and tries
    // to detective-work whether the writes happened. The 2,361-char
    // tangent on the first prod confirm was that exact failure mode.
    //
    // Past-tense + "verifying" framing tells the LLM: "The writes
    // executed. The post-write refresh reads you're about to see are
    // VERIFICATION reads. Now narrate the outcome." Empirically saves
    // ~2,000 thinking chars per fast-path narration turn.
    syntheticAssistantText:
      `Confirmed. Bundle dispatched as one atomic Payment Stream (${proposal.steps.length} writes) — verifying on-chain outcome.`,
    admittedVia,
  };
}

export const __testOnly__ = {
  buildPendingActionFromProposal,
  describeStep,
};
