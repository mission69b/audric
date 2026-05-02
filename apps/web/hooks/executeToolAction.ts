import { parseActualAmount, buildSwapDisplayData } from '@/lib/balance-changes';
import { ServiceDeliveryError, type AgentActions, type BundleStep } from '@/hooks/useAgent';
import { looksLikeSuiNs } from '@/lib/suins-resolver';
import type { PendingAction, PendingActionStep } from '@t2000/engine';

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
}

export type ExecuteToolActionResult = { success: boolean; data: unknown };

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

    case 'swap_execute': {
      try {
        const res = await sdk.swap({
          from: String(inp.from),
          to: String(inp.to),
          amount: Number(inp.amount),
          slippage: inp.slippage ? Number(inp.slippage) : undefined,
          byAmountIn: inp.byAmountIn as boolean | undefined,
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
      try {
        const serviceResult = await sdk.payService({
          url: inp.url as string,
          rawBody: inp.body ? JSON.parse(String(inp.body)) : undefined,
        });
        return { success: true, data: serviceResult };
      } catch (payErr) {
        if (payErr instanceof ServiceDeliveryError) {
          const price = (payErr.meta as { price?: string | number } | undefined)?.price ?? '?';
          return {
            success: false,
            data: {
              error: payErr.message,
              paymentConfirmed: true,
              paymentDigest: payErr.paymentDigest,
              doNotRetry: true,
              warning:
                'Payment was already charged on-chain. DO NOT call pay_api again for this request. ' +
                `Tell the user the service failed and their payment of $${price} was charged. ` +
                'They can contact support for a refund.',
            },
          };
        }
        const msg = payErr instanceof Error ? payErr.message : String(payErr);
        return { success: false, data: { error: msg } };
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

// ─── SPEC 7 P2.4 Layer 3 — Bundle (Payment Stream) executor ────────────────

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
}

/**
 * [SPEC 7 P2.4 Layer 3] Per-step result mapping for a multi-write bundle.
 *
 * The PTB executes atomically server-side; we get back ONE tx digest and
 * ONE flattened balanceChanges array. For per-step `result` shapes that
 * the LLM can narrate, we echo each step's input + the shared tx digest
 * (mirroring the single-write per-tool shapes from executeToolAction).
 *
 * Why echo instead of parsing per-step:
 *   - PTB intermediate outputs (e.g. swap output → save input for the same
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
 * Execute a multi-write Payment Stream bundle.
 *
 * Calls `sdk.executeBundle(steps)` — which posts to /api/transactions/prepare
 * with `type: 'bundle'`, gets a sponsored PTB back, signs locally, executes
 * via /api/transactions/execute. The whole bundle is one atomic tx
 * (all-succeed-or-all-revert by Sui PTB semantics).
 *
 * On success, builds per-step results echoing each step's input + the
 * shared tx digest. On failure, returns N error results so the engine's
 * resume loop can narrate "the bundle reverted" coherently for every step
 * (matches the engine-side atomic semantics in `runPostWriteRefresh`).
 */
export async function executeBundleAction(
  sdk: AgentActions,
  action: PendingAction,
): Promise<ExecuteBundleResult> {
  if (!action.steps || action.steps.length === 0) {
    throw new Error('executeBundleAction called with no steps');
  }

  const wireSteps: BundleStep[] = action.steps.map((s) => ({
    toolName: s.toolName,
    input: s.input,
  }));

  try {
    const res = await sdk.executeBundle(wireSteps);
    const stepResults = action.steps.map((step) =>
      buildStepResultFromInput(step, res.tx),
    );
    return { success: true, txDigest: res.tx, stepResults };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Bundle execution failed';
    // Atomic semantics: if the PTB reverts, every step failed. Surface a
    // matching error result for each step so the engine's resume route
    // pushes N tool_result blocks back to the LLM with consistent reason.
    const stepResults = action.steps.map((step) => ({
      toolUseId: step.toolUseId,
      attemptId: step.attemptId,
      result: {
        success: false,
        error: errorMsg,
        _bundleReverted: true,
      },
      isError: true,
    }));
    return { success: false, error: errorMsg, stepResults };
  }
}
