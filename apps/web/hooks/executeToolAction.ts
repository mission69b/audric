import { parseActualAmount, buildSwapDisplayData } from '@/lib/balance-changes';
import { ServiceDeliveryError, type AgentActions } from '@/hooks/useAgent';

/**
 * Side-effect callbacks the pure helper needs from React land.
 * Kept optional and explicit so the helper stays testable without RTL.
 */
export interface ExecuteToolActionEffects {
  resolveContact?: (raw: string) => string | null;
  addContact?: (name: string, address: string) => Promise<void>;
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
      const resolvedTo = effects.resolveContact?.(rawTo) ?? rawTo;
      const res = await sdk.send({
        to: resolvedTo,
        amount: Number(inp.amount),
        asset: inp.asset as string | undefined,
      });
      const actual = parseActualAmount(res.balanceChanges, inp.asset as string, 'negative');
      return {
        success: true,
        data: { success: true, tx: res.tx, amount: actual ?? inp.amount, to: rawTo },
      };
    }

    case 'borrow': {
      const res = await sdk.borrow({
        amount: Number(inp.amount),
        protocol: inp.protocol as string | undefined,
      });
      // [v1.4 fix] Use balanceChanges to surface the actual disbursed USDC,
      // not the requested input. Borrow protocols can deduct fees on disbursal.
      const actual = parseActualAmount(res.balanceChanges, 'USDC', 'positive');
      return {
        success: true,
        data: { success: true, tx: res.tx, amount: actual ?? inp.amount },
      };
    }

    case 'repay_debt': {
      const res = await sdk.repay({
        amount: Number(inp.amount),
        protocol: inp.protocol as string | undefined,
      });
      // [v1.4 fix] Repay-all may settle a different amount than `inp.amount`.
      const actual = parseActualAmount(res.balanceChanges, 'USDC', 'negative');
      return {
        success: true,
        data: { success: true, tx: res.tx, amount: actual ?? inp.amount },
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

    case 'save_contact': {
      if (!effects.addContact) {
        throw new Error('save_contact requires effects.addContact callback');
      }
      await effects.addContact(String(inp.name), String(inp.address));
      return { success: true, data: { saved: true, name: inp.name, address: inp.address } };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
