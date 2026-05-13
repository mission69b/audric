import { parseActualAmount, buildSwapDisplayData } from '@/lib/balance-changes';
import {
  EnokiSessionExpiredError,
  ServiceDeliveryError,
  SettleNoDeliveryError,
  type AgentActions,
  type BundleStep,
} from '@/hooks/useAgent';
import { looksLikeSuiNs } from '@/lib/suins-resolver';
import type { PendingAction, PendingActionStep } from '@t2000/engine';

/**
 * [S.122] Sentinel returned to the caller when the SDK throws an
 * EnokiSessionExpiredError — bypasses the resume → Anthropic narration
 * path (which 4xxs Anthropic with the wrong-shape message ledger) and
 * lets the dashboard render the re-auth banner directly. Mirrors the
 * `_bundleReverted` sentinel for atomic on-chain reverts.
 */
export const SESSION_EXPIRED_USER_MESSAGE =
  'Your sign-in session has expired. Please sign back in to continue. Your funds are safe — nothing was submitted on-chain.';

/**
 * [Bug B fix / 2026-05-10] Build the error string that gets JSON-stringified
 * into each `_bundleReverted` stepResult.result.error and fed to the LLM
 * as `tool_result.content` on the resume turn.
 *
 * **Why a strong inline directive (not just a system-prompt rule).**
 * The system prompt at `engine-context.ts:123` already says "Failed write
 * (atomic = no settlement delay): isError: true or _bundleReverted: true
 * means the tx did NOT execute..." — that lives ~24k cached tokens deep
 * and the LLM activates it opportunistically. Production smoke 2026-05-10
 * (Bug B) showed the LLM ignored this rule and narrated "Bundle executed.
 * Swapped 5 USDC → SUI..." even though every stepResult carried
 * `isError: true`, `_bundleReverted: true`, and the post-write
 * `balance_check` showed unchanged balances.
 *
 * The fix: embed the narration directive INLINE in the error text the
 * LLM is asked to narrate from. Inline tool_result content is much harder
 * to ignore than abstract system-prompt rules.
 *
 * **Format choices.**
 * - Lead with `BUNDLE REVERTED — NOTHING EXECUTED ON-CHAIN.` (no soft
 *   verbs like "may have failed" or "appears to have"). The all-caps
 *   prefix mirrors the pattern from S.122 `SESSION_EXPIRED_USER_MESSAGE`
 *   that's been working in production for ~5 days.
 * - State the atomic semantics explicitly so the LLM can't speculate
 *   about partial settlement.
 * - Tell the user what's true RIGHT NOW (balances unchanged) — anchors
 *   the LLM on observable on-chain state vs. its own running tally.
 * - Echo the cause string so users get the "why" (sometimes it's
 *   actionable: slippage too tight, insufficient balance, etc.).
 * - Close with explicit forbidden phrases — the LLM is trained to obey
 *   "do NOT say X" prompts more reliably than "you MUST do Y" prompts.
 *
 * **What this does NOT do.**
 * - Doesn't change the UI (BundleReceiptBlockView already shows
 *   "PAYMENT INTENT REVERTED" via timeline-builder.ts:1046 detection).
 * - Doesn't add an engine-side guard. This is a content fix, not a
 *   structural enforcement. The post-write balance_check still fires;
 *   the LLM is still free to narrate. We're just making "narrate
 *   correctly" the path of least resistance.
 */
export function buildBundleRevertedError(rawError: string): string {
  return [
    'BUNDLE REVERTED — NOTHING EXECUTED ON-CHAIN.',
    'Atomic Sui Payment Intent semantics: the entire bundle reverted before any leg settled.',
    'Wallet balances are unchanged from before the user tapped Confirm.',
    `Cause: ${rawError}`,
    'Narration rule: tell the user clearly that the bundle reverted and nothing executed.',
    'Do NOT claim ANY operation succeeded.',
    'Do NOT say "settling", "in progress", or "confirming" — atomic semantics make it final immediately.',
  ].join(' ');
}

/**
 * Side-effect callbacks the pure helper needs from React land.
 * Kept optional and explicit so the helper stays testable without RTL.
 *
 * `addContact` was removed when `save_contact` moved server-side
 * (see the tombstone in the switch below).
 *
 * `resolveSuiNs` is async and only called for inputs that look like SuiNS
 * names (ending in `.sui`). Throws `SuinsResolutionError` from
 * `lib/suins-resolver.ts` on failure — the caller branch (send_transfer)
 * lets the error propagate so the LLM narrates the truthful reason
 * (not registered / RPC down / etc.) rather than confabulating.
 */
export interface ExecuteToolActionEffects {
  resolveContact?: (raw: string) => string | null;
  resolveSuiNs?: (rawName: string) => Promise<string>;
  /**
   * [SPEC 20.2 / D-1 (a)] Optional engine-emitted Cetus route, threaded
   * down from `pending_action.cetusRoute` by the dashboard caller. When
   * present, `swap_execute` passes it to `sdk.swap(...)` which forwards
   * to `/api/transactions/prepare` as a fast-path (skips the ~400-500ms
   * Cetus findSwapRoute() re-discovery). Undefined for non-swap tools and
   * pre-SPEC-20.2 sessions (legacy fallback per D-5).
   */
  cetusRoute?: unknown;
}

export type ExecuteToolActionResult = {
  success: boolean;
  data: unknown;
  /**
   * [S.122] Mirrors {@link ExecuteBundleResult.sessionExpired}. Set when
   * the SDK threw `EnokiSessionExpiredError`; the dashboard renders the
   * re-auth banner + skips the resume → Anthropic call.
   */
  sessionExpired?: boolean;
};

/**
 * Pure executor for write-tool actions confirmed in the chat UI.
 * Returns wrapped `{ success, data }` for ALL branches so the resume route's
 * executionResult shape stays uniform.
 *
 * Amount-bug fix [v1.4]: branches that previously echoed `inp.amount` now
 * derive the actual on-chain amount from balanceChanges via parseActualAmount,
 * matching what save_deposit / withdraw / send_transfer already do.
 */
export async function executeToolAction(
  sdk: AgentActions,
  toolName: string,
  input: unknown,
  effects: ExecuteToolActionEffects = {},
): Promise<ExecuteToolActionResult> {
  // [S.122] Session-expired wrapper — every write tool below dispatches
  // through `sdk.X(...)` which can throw `EnokiSessionExpiredError`. Wrap
  // the whole switch so any tool that fails on Enoki sponsorship surfaces
  // the typed sentinel without each branch having to repeat the catch.
  // pay_api goes through `/api/services/prepare` (separate sponsor path),
  // so it never throws this class — the wrapper is a safe no-op there.
  try {
    return await executeToolActionImpl(sdk, toolName, input, effects);
  } catch (err) {
    if (err instanceof EnokiSessionExpiredError) {
      return {
        success: false,
        sessionExpired: true,
        data: {
          success: false,
          error: SESSION_EXPIRED_USER_MESSAGE,
          _sessionExpired: true,
        },
      };
    }
    throw err;
  }
}

async function executeToolActionImpl(
  sdk: AgentActions,
  toolName: string,
  input: unknown,
  effects: ExecuteToolActionEffects = {},
): Promise<ExecuteToolActionResult> {
  const inp = (input ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case 'save_deposit': {
      const res = await sdk.save({
        amount: Number(inp.amount),
        asset: inp.asset as string | undefined,
        protocol: inp.protocol as string | undefined,
      });
      const actual = parseActualAmount(res.balanceChanges, inp.asset as string, 'negative');
      return {
        success: true,
        data: { success: true, tx: res.tx, amount: actual ?? inp.amount, asset: inp.asset },
      };
    }

    case 'withdraw': {
      const res = await sdk.withdraw({
        amount: Number(inp.amount),
        asset: inp.asset as string | undefined,
        protocol: inp.protocol as string | undefined,
      });
      const actual = parseActualAmount(res.balanceChanges, inp.asset as string, 'positive');
      return {
        success: true,
        data: { success: true, tx: res.tx, amount: actual ?? inp.amount, asset: inp.asset },
      };
    }

    case 'send_transfer': {
      const rawTo = String(inp.to);

      // Resolution order:
      //   1. Saved contact (alex → 0x...). Free, in-memory hashmap.
      //   2. SuiNS name (alex.sui → 0x... via /api/suins/resolve). One RPC.
      //   3. Pass through (assume it's already a 0x address, let SDK validate).
      //
      // Pre-fix, the LLM hallucinated step 2 — telling users "I tried that
      // already, the SuiNS name couldn't be resolved" when no SuiNS lookup
      // had ever happened. Now step 2 is a real call; failures throw a
      // SuinsResolutionError with a truthful narration that the LLM can
      // pass through without making things up.
      const contactAddr = effects.resolveContact?.(rawTo) ?? null;
      const usedSuins = !contactAddr && looksLikeSuiNs(rawTo) && !!effects.resolveSuiNs;

      let resolvedTo: string;
      if (contactAddr) {
        resolvedTo = contactAddr;
      } else if (usedSuins) {
        // Throws SuinsResolutionError on failure — propagates to the LLM
        // so it can narrate "not a registered SuiNS name" / "RPC failure"
        // instead of confabulating.
        resolvedTo = await effects.resolveSuiNs!(rawTo);
      } else {
        resolvedTo = rawTo;
      }

      const res = await sdk.send({
        to: resolvedTo,
        amount: Number(inp.amount),
        asset: inp.asset as string | undefined,
      });
      const actual = parseActualAmount(res.balanceChanges, inp.asset as string, 'negative');

      // Receipt-card data shape:
      //   - `to`           is ALWAYS the on-chain 0x address (what actually moved).
      //                    Used by TransactionReceiptCard to render the chunked
      //                    hex line — `isSuiAddress(to)` must hold for the chunked
      //                    render to fire. Pre-fix this was `rawTo`, so SuiNS /
      //                    contact sends rendered a blank "To" row because
      //                    `isSuiAddress('funkii.sui')` is false.
      //   - `contactName`  human-readable name when the user used a saved contact.
      //                    Mirrors what the engine-side transfer.ts tool sets via
      //                    `agent.send()` so both code paths produce the same
      //                    receipt shape.
      //   - `suinsName`    human-readable name when the user used a SuiNS name.
      //                    Treated the same way as contactName by the renderer
      //                    (display the name, chunked address beneath).
      return {
        success: true,
        data: {
          success: true,
          tx: res.tx,
          amount: actual ?? inp.amount,
          to: resolvedTo,
          contactName: contactAddr ? rawTo : undefined,
          suinsName: usedSuins ? rawTo : undefined,
        },
      };
    }

    case 'borrow': {
      // [v0.51.0] Pass asset through (USDC or USDsui) so the borrow routes to
      // the right NAVI pool. parseActualAmount also keys off the chosen asset
      // — if we left it hardcoded as 'USDC', a USDsui borrow's balanceChanges
      // would parse to null and we'd echo back the requested input instead of
      // the on-chain truth.
      const borrowAsset = (inp.asset as string | undefined) ?? 'USDC';
      const res = await sdk.borrow({
        amount: Number(inp.amount),
        asset: borrowAsset,
        protocol: inp.protocol as string | undefined,
      });
      const actual = parseActualAmount(res.balanceChanges, borrowAsset, 'positive');
      return {
        success: true,
        data: { success: true, tx: res.tx, amount: actual ?? inp.amount, asset: borrowAsset },
      };
    }

    case 'repay_debt': {
      // [v0.51.1] Plumb asset (USDC or USDsui) end-to-end. parseActualAmount
      // keys off the chosen asset to read the correct balanceChanges row —
      // a USDsui repay's balanceChanges row carries the USDsui coin type,
      // so hardcoding 'USDC' would parse to null and we'd echo back the
      // requested input instead of the on-chain truth.
      const repayAsset = (inp.asset as string | undefined) ?? 'USDC';
      const res = await sdk.repay({
        amount: Number(inp.amount),
        asset: repayAsset,
        protocol: inp.protocol as string | undefined,
      });
      // [v1.4 fix] Repay-all may settle a different amount than `inp.amount`.
      const actual = parseActualAmount(res.balanceChanges, repayAsset, 'negative');
      return {
        success: true,
        data: { success: true, tx: res.tx, amount: actual ?? inp.amount, asset: repayAsset },
      };
    }

    case 'claim_rewards': {
      // [v1.4 wrap] Shape parity with the other write-tool branches.
      const res = await sdk.claimRewards();
      return { success: true, data: { success: true, tx: res.tx } };
    }

    case 'harvest_rewards': {
      // [Track B / 2026-05-08] One PTB → claim → swap → save. The
      // HarvestPlan was computed server-side at compose time and threaded
      // back through `res.harvestPlan`; we MERGE it into the result data
      // so the resume tool_result carries the per-leg breakdown the LLM
      // needs to narrate the outcome ("you claimed 0.0165 vSUI, swapped
      // to ~$0.020 USDC, deposited into NAVI") and the receipt card has
      // the rows to render.
      const slippage =
        typeof inp.slippage === 'number' ? inp.slippage : undefined;
      const minRewardUsd =
        typeof inp.minRewardUsd === 'number' ? inp.minRewardUsd : undefined;
      const res = await sdk.harvestRewards({ slippage, minRewardUsd });
      const plan = res.harvestPlan;
      return {
        success: true,
        data: {
          success: true,
          tx: res.tx,
          ...(plan
            ? {
                claimed: plan.claimed,
                swaps: plan.swaps,
                skipped: plan.skipped,
                expectedUsdcDeposited: plan.expectedUsdcDeposited,
              }
            : {}),
        },
      };
    }

    case 'swap_execute': {
      try {
        const res = await sdk.swap({
          from: String(inp.from),
          to: String(inp.to),
          amount: Number(inp.amount),
          slippage: inp.slippage ? Number(inp.slippage) : undefined,
          byAmountIn: inp.byAmountIn as boolean | undefined,
          // [SPEC 20.2 / D-1 (a)] Forward the engine-captured route to the
          // SDK so /api/transactions/prepare can skip findSwapRoute().
          // Undefined → legacy fallback (correct, just slower).
          cetusRoute: effects.cetusRoute,
        });
        const swap = buildSwapDisplayData(
          res.balanceChanges,
          String(inp.from),
          String(inp.to),
          Number(inp.amount),
        );
        // [v1.4 fix] Top-level `amount` now reflects the parsed sold amount,
        // not the user-requested input — important when slippage trims execution.
        return {
          success: true,
          data: {
            success: true,
            tx: res.tx,
            ...swap,
            from: swap.fromToken,
            to: swap.toToken,
            amount: swap.fromAmount,
          },
        };
      } catch (swapErr) {
        // [S.122] Re-throw session-expired so the outer wrapper sees it
        // and emits the typed sentinel — without this rethrow the
        // session-expired would be swallowed into a generic error and
        // the dashboard would route through the resume → Anthropic path.
        if (swapErr instanceof EnokiSessionExpiredError) throw swapErr;
        const msg = swapErr instanceof Error ? swapErr.message : String(swapErr);
        return {
          success: false,
          data: { success: false, error: msg, from: inp.from, to: inp.to, amount: inp.amount },
        };
      }
    }

    case 'volo_stake': {
      const res = await sdk.stakeVSui({ amount: Number(inp.amount) });
      // [v1.4 fix] vSUI received is the actual minted amount, not the SUI input.
      const vSuiReceived = parseActualAmount(res.balanceChanges, 'VSUI', 'positive');
      return {
        success: true,
        data: {
          success: true,
          tx: res.tx,
          amount: inp.amount,
          vSuiReceived: vSuiReceived ?? null,
        },
      };
    }

    case 'volo_unstake': {
      const res = await sdk.unstakeVSui({ amount: Number(inp.amount ?? 0) });
      // [v1.4 fix] SUI received reflects the unstaked SUI proceeds.
      const suiReceived = parseActualAmount(res.balanceChanges, 'SUI', 'positive');
      return {
        success: true,
        data: {
          success: true,
          tx: res.tx,
          amount: inp.amount,
          suiReceived: suiReceived ?? null,
        },
      };
    }

    case 'pay_api': {
      // [v1.4 wrap] Always returns wrapped { success, data } for shape parity;
      // ServiceDeliveryError carries the don't-retry signal in `data`.
      // [B-MPP6 v1.1 / 2026-05-12] Error envelope now ALSO preserves
      // `serviceId`, `price`, and stamps `success: false` on the inner
      // data so `renderMppService` can dispatch to a vendor-named error
      // surface (`<ErrorReceipt>`) instead of falling through to the
      // generic `<GenericMppReceipt>`. Pre-fix, the error envelope only
      // carried `error` + `paymentConfirmed` + `paymentDigest`, so the
      // host-side renderer couldn't tell which vendor had failed and
      // rendered "MPP SERVICE · MPP" with a `—` price (the
      // `bug_audric_error_receipt_shape` from HANDOFF §8). The url is
      // always available on `inp.url` (engine-validated upstream), so
      // serviceId is recoverable for free.
      const serviceUrl = inp.url as string | undefined;
      const serviceId = serviceUrl
        ? serviceUrl.replace(/^https?:\/\/[^/]+\//, '')
        : undefined;
      try {
        const serviceResult = await sdk.payService({
          url: serviceUrl as string,
          rawBody: inp.body ? JSON.parse(String(inp.body)) : undefined,
        });
        // [SPEC 23B-MPP6 UX polish / 2026-05-12] Stamp serviceId on success
        // too. Pre-fix only the error path attached serviceId, so DALL-E /
        // ElevenLabs / etc. successes fell back to the generic
        // "IMAGE PREVIEW" header in CardPreview.vendorLabel because
        // `data.serviceId` was undefined. Now both success + error paths
        // carry the same serviceId so the vendor-aware header always
        // resolves correctly. Spread first so the gateway response wins
        // for any field the SDK already populates.
        return { success: true, data: { ...(serviceResult as object), serviceId } };
      } catch (payErr) {
        // [SPEC 26 P5 review remediation / 2026-05-13] SettleNoDeliveryError
        // discriminates BEFORE ServiceDeliveryError because the two errors
        // mean OPPOSITE things (no-charge-free-retry vs charged-don't-retry).
        // The LLM-facing payload mirrors `pay.ts` D-8 prompt — `status: 402`
        // + `paymentConfirmed: false` + `settleVerdict` + `settleReason` so
        // the LLM can pick "retry as-is" (transient) vs "fix params then
        // retry" (correctable). `paymentDigest` is preserved as a bookkeeping
        // handle for the deferred refund(digest) primitive (SPEC 26 O-4).
        if (payErr instanceof SettleNoDeliveryError) {
          return {
            success: false,
            data: {
              success: false,
              error: payErr.message,
              status: 402,
              paymentConfirmed: false,
              settleVerdict: payErr.settleVerdict,
              settleReason: payErr.settleReason,
              paymentDigest: payErr.paymentDigest,
              serviceId,
              hint:
                'Free retry — the gateway probed upstream and chose NOT to consume the payment receipt. ' +
                'Use settleReason to decide: transient (rate-limit, 5xx) → retry as-is; correctable ' +
                '(invalid model / size / prompt) → fix the param then retry.',
            },
          };
        }
        if (payErr instanceof ServiceDeliveryError) {
          const price = (payErr.meta as { price?: string | number } | undefined)?.price;
          const priceLabel = price ?? '?';
          return {
            success: false,
            data: {
              success: false,
              error: payErr.message,
              paymentConfirmed: true,
              paymentDigest: payErr.paymentDigest,
              doNotRetry: true,
              serviceId,
              price: price != null ? String(price) : undefined,
              warning:
                'Payment was already charged on-chain. DO NOT call pay_api again for this request. ' +
                `Tell the user the service failed and their payment of $${priceLabel} was charged. ` +
                'They can contact support for a refund.',
            },
          };
        }
        const msg = payErr instanceof Error ? payErr.message : String(payErr);
        return {
          success: false,
          data: {
            success: false,
            error: msg,
            paymentConfirmed: false,
            serviceId,
          },
        };
      }
    }

    // Note: `save_contact` used to dispatch here via `effects.addContact`
    // (client POST to `/api/user/preferences`). That path silently lost
    // contacts when the POST returned a non-2xx response — the in-session
    // React state updated, the LLM narrated success, but Postgres never
    // saw the row. The audric override in `lib/engine/contact-tools.ts`
    // now persists server-side via Prisma with `permissionLevel: 'auto'`,
    // so the engine never yields a `pending_action` for save_contact and
    // this dispatcher is never reached for that tool. Kept the comment as
    // a tombstone in case anyone wonders why the case is missing.

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── SPEC 7 P2.4 Layer 3 — Bundle (Payment Intent) executor ───────────────

export interface BundleStepResult {
  toolUseId: string;
  attemptId: string;
  result: unknown;
  isError: boolean;
}

export interface ExecuteBundleResult {
  success: boolean;
  txDigest?: string;
  stepResults: BundleStepResult[];
  error?: string;
  /**
   * [S.122] True iff the failure was an Enoki session-expired (zkLogin JWT
   * past `exp` or signed by a now-rotated Google JWK). Distinct from
   * `_bundleReverted` (on-chain Payment Intent revert) — when true, the
   * bundle never reached chain so the dashboard renders a re-auth banner
   * + skips the resume → Anthropic call entirely (which silently rejects
   * the post-failure narration request).
   */
  sessionExpired?: boolean;
}

/**
 * [SPEC 7 P2.4 Layer 3] Per-step result mapping for a multi-write bundle.
 *
 * The Payment Intent executes atomically server-side; we get back ONE tx
 * digest and ONE flattened balanceChanges array. For per-step `result`
 * shapes that the LLM can narrate, we echo each step's input + the shared
 * tx digest (mirroring the single-write per-tool shapes from
 * executeToolAction).
 *
 * Why echo instead of parsing per-step:
 *   - Payment Intent intermediate outputs (e.g. swap output → save input for the same
 *     asset) don't appear in net balanceChanges — the asset comes in then
 *     goes out, netting to zero. Per-step parse can't recover them.
 *   - The LLM narration only needs the user's INTENT per step ("swapped X,
 *     then saved Y"). The receipt card renders the actual balance changes
 *     separately — that's where on-chain fidelity surfaces.
 *
 * Future fidelity work: thread `composed.perStepPreviews` from the prepare
 * route through the execute response and use it to build accurate per-step
 * results. Tracked in SPEC 12.
 */
function buildStepResultFromInput(
  step: PendingActionStep,
  txDigest: string,
): BundleStepResult {
  const inp = (step.input ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {
    success: true,
    tx: txDigest,
  };

  switch (step.toolName) {
    case 'save_deposit':
    case 'withdraw':
      result.amount = inp.amount;
      result.asset = inp.asset ?? 'USDC';
      break;
    case 'send_transfer':
      result.amount = inp.amount;
      result.to = inp.to;
      result.asset = inp.asset ?? 'USDC';
      break;
    case 'borrow':
    case 'repay_debt':
      result.amount = inp.amount;
      result.asset = inp.asset ?? 'USDC';
      break;
    case 'swap_execute':
      result.from = inp.from;
      result.to = inp.to;
      result.amount = inp.amount;
      break;
    case 'volo_stake':
    case 'volo_unstake':
      result.amount = inp.amount;
      break;
    // claim_rewards: just `{ success, tx }` — no extra fields
  }

  return {
    toolUseId: step.toolUseId,
    attemptId: step.attemptId,
    result,
    isError: false,
  };
}

/**
 * Execute a multi-write Payment Intent.
 *
 * Calls `sdk.executeBundle(steps)` — which posts to /api/transactions/prepare
 * with `type: 'bundle'`, gets a sponsored Payment Intent back, signs locally,
 * executes via /api/transactions/execute. The whole intent is one atomic tx
 * (all-succeed-or-all-revert by Sui PTB semantics under the hood).
 *
 * On success, builds per-step results echoing each step's input + the
 * shared tx digest. On failure, returns N error results so the engine's
 * resume loop can narrate "the bundle reverted" coherently for every step
 * (matches the engine-side atomic semantics in `runPostWriteRefresh`).
 */
export async function executeBundleAction(
  sdk: AgentActions,
  action: PendingAction,
  effects: ExecuteToolActionEffects = {},
): Promise<ExecuteBundleResult> {
  if (!action.steps || action.steps.length === 0) {
    throw new Error('executeBundleAction called with no steps');
  }

  // [F7 / SPEC 12] Resolve recipient names BEFORE handing the bundle to
  // the SDK + prepare route. Single-write `send_transfer` already does
  // this in the case branch above; bundles silently skipped it pre-fix
  // and the SDK's `validateAddress` rejected raw contact strings like
  // "funkii" with a non-obvious Enoki dry-run failure
  // (`CommandArgumentError { arg_idx: 1, kind: ArgumentWithoutValue }`).
  //
  // Resolution order mirrors single-write exactly:
  //   1. Saved contact (alex → 0x...). Free, in-memory hashmap.
  //   2. SuiNS name (alex.sui → 0x... via /api/suins/resolve).
  //   3. Pass through (assume it's already a 0x address; SDK validates).
  //
  // Only `send_transfer.to` is resolved — `swap_execute.to` carries a
  // token symbol, not a recipient (mirrors `TOOLS_WHERE_TO_IS_RECIPIENT`
  // gate in `lib/timeline-builder.ts`).
  //
  // SuiNS errors (SuinsResolutionError) are caught and surfaced through
  // the same atomic _bundleReverted shape as on-chain failures, so the
  // engine resume route always gets a uniform N stepResults response.
  // (Single-write lets the error propagate; bundles fold it into the
  // atomic-revert contract instead.)
  let resolvedSteps: PendingActionStep[];
  try {
    resolvedSteps = await Promise.all(
      action.steps.map(async (s) => {
        if (s.toolName !== 'send_transfer') return s;
        const inp = (s.input ?? {}) as Record<string, unknown>;
        const rawTo = String(inp.to ?? '');
        if (!rawTo) return s;
        const contactAddr = effects.resolveContact?.(rawTo) ?? null;
        let resolvedTo: string;
        if (contactAddr) {
          resolvedTo = contactAddr;
        } else if (looksLikeSuiNs(rawTo) && effects.resolveSuiNs) {
          resolvedTo = await effects.resolveSuiNs(rawTo);
        } else {
          resolvedTo = rawTo;
        }
        if (resolvedTo === rawTo) return s;
        return { ...s, input: { ...inp, to: resolvedTo } };
      }),
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Recipient resolution failed';
    const stepResults = action.steps.map((step) => ({
      toolUseId: step.toolUseId,
      attemptId: step.attemptId,
      result: {
        success: false,
        error: buildBundleRevertedError(errorMsg),
        _bundleReverted: true,
      },
      isError: true,
    }));
    return { success: false, error: errorMsg, stepResults };
  }

  const wireSteps: BundleStep[] = resolvedSteps.map((s) => ({
    toolName: s.toolName,
    input: s.input,
    ...(s.inputCoinFromStep !== undefined ? { inputCoinFromStep: s.inputCoinFromStep } : {}),
    // [SPEC 20.2 / D-1 (a)] For swap_execute steps, forward the engine-
    // captured route. Server validates + injects as input.precomputedRoute
    // before `composeTx`. Non-swap steps never carry a cetusRoute (engine
    // only emits it for swap_execute) so this is a no-op for them.
    ...(s.cetusRoute !== undefined ? { cetusRoute: s.cetusRoute } : {}),
  }));

  try {
    const res = await sdk.executeBundle(wireSteps);
    // Use `resolvedSteps` (not `action.steps`) so the stepResults' echoed
    // `to` field reflects the on-chain recipient — matches single-write
    // receipt parity and the BundleReceiptBlockView leg description.
    const stepResults = resolvedSteps.map((step) =>
      buildStepResultFromInput(step, res.tx),
    );
    return { success: true, txDigest: res.tx, stepResults };
  } catch (err) {
    // [S.122] Session-expired path — distinct sentinel so the dashboard
    // skips the resume → Anthropic call (which silently rejects with
    // "rejected by Anthropic, please retry") and renders the re-auth
    // banner immediately. The bundle never reached chain — Enoki refused
    // to sponsor — so it's NOT semantically `_bundleReverted` (which
    // implies on-chain revert). Every step gets the same flag so the
    // bundle UI renders one unified "session expired" state, not N
    // separate revert rows.
    if (err instanceof EnokiSessionExpiredError) {
      const stepResults = action.steps.map((step) => ({
        toolUseId: step.toolUseId,
        attemptId: step.attemptId,
        result: {
          success: false,
          error: SESSION_EXPIRED_USER_MESSAGE,
          _sessionExpired: true,
        },
        isError: true,
      }));
      return {
        success: false,
        error: SESSION_EXPIRED_USER_MESSAGE,
        sessionExpired: true,
        stepResults,
      };
    }
    const errorMsg = err instanceof Error ? err.message : 'Bundle execution failed';
    // Atomic semantics: if the Payment Intent reverts, every step failed. Surface a
    // matching error result for each step so the engine's resume route
    // pushes N tool_result blocks back to the LLM with consistent reason.
    //
    // [Bug B fix / 2026-05-10] Wrap errorMsg with `buildBundleRevertedError`
    // so the LLM can't confabulate success on this turn. The narration
    // directive is embedded inline in the error string the LLM is asked
    // to narrate from — much harder to ignore than the abstract system-
    // prompt rule at engine-context.ts:123 (which got ignored in
    // production smoke 2026-05-10 when Bug A surfaced).
    const stepResults = action.steps.map((step) => ({
      toolUseId: step.toolUseId,
      attemptId: step.attemptId,
      result: {
        success: false,
        error: buildBundleRevertedError(errorMsg),
        _bundleReverted: true,
      },
      isError: true,
    }));
    return { success: false, error: errorMsg, stepResults };
  }
}
