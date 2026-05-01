'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useToast } from '@/components/ui/Toast';

/**
 * USDC delta below this threshold is treated as noise (rounding /
 * intermediate-state flicker between consecutive polls). Anything ≥ 1¢
 * is a real receive worth surfacing.
 */
const MIN_DELTA_USDC = 0.01;

/**
 * Window after a user-initiated tx during which we suppress receive toasts.
 * useBalance polls every 30s. The original 60s window covered two grace
 * polls but was too tight for swap-to-USDC settlement on slow indexer
 * conditions: swap settles in ~3s on chain, indexer can lag 5-30s,
 * then the next poll fires. Founder hit the edge case 2026-05-01 — got
 * a "+$4.55 deposit" toast 1 min after a `swap_execute` 5 SUI → 4.55
 * USDC settled. 120s covers settlement + worst-case indexer lag + four
 * grace polls without making genuine inbound deposits look stale (real
 * receives still toast within 2 min of the last user-initiated tx).
 */
const USER_ACTION_GRACE_MS = 120_000;

interface UseReceiveToastOpts {
  /**
   * Current USDC count (NOT USD — though for USDC they're effectively equal).
   * Pass `undefined` while the balance query is loading so we don't fire a
   * toast for the initial null → first-value transition.
   */
  usdc: number | undefined;
  /**
   * Ref to a `Date.now()` timestamp set by callers RIGHT BEFORE they invoke
   * a write tool (save / send / swap / withdraw / borrow / repay / claim /
   * volo). Set this in the wrapper around `executeToolAction`. The hook reads
   * the ref each render to decide whether the latest delta is "expected"
   * (user-initiated) or "unexpected" (real inbound deposit).
   *
   * Refs (vs state) are intentional: we need the latest value when the
   * polling-driven balance update arrives, without re-rendering every
   * consumer of dashboard-content when we update the timestamp.
   */
  lastUserActionAtRef: MutableRefObject<number>;
}

/**
 * Surface a toast when a USDC inbound deposit lands while the user wasn't
 * the one initiating it.
 *
 * The 30-second polling cadence in `useBalance` means latency is up to 30s;
 * a future PR can layer Sui event subscriptions on top for sub-second
 * notifications, but this version unblocks the "did my deposit arrive?"
 * UX gap with zero infra changes.
 *
 * Sequence:
 *   t=0    user shares address (Receive chip)
 *   t=12   sender broadcasts a transfer
 *   t=15   tx confirms on-chain
 *   t=≤30  next useBalance poll fires → delta detected → toast fires
 *
 * Suppression conditions (no toast):
 *   - First non-undefined balance after mount (initial-load / reconnect)
 *   - Delta ≤ 0 (decrease or no-op)
 *   - Delta < MIN_DELTA_USDC (noise filter)
 *   - Within USER_ACTION_GRACE_MS of the last user-initiated tx (their own
 *     withdraw / swap-to-USDC / repay-and-receive-change would otherwise
 *     trigger a misleading "received" toast)
 */
export function useReceiveToast({ usdc, lastUserActionAtRef }: UseReceiveToastOpts) {
  const { richToast } = useToast();

  // Track the previous USDC value across polls. `undefined` until the first
  // non-undefined value is observed — that initial transition is treated as
  // "first load", not a delta, to avoid spurious toasts when a returning user
  // rehydrates the balance query cache.
  const prevUsdcRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (usdc === undefined) return; // balance still loading

    const prev = prevUsdcRef.current;
    prevUsdcRef.current = usdc;

    // First observation after mount — establish baseline, don't toast.
    if (prev === undefined) return;

    const delta = usdc - prev;
    if (delta < MIN_DELTA_USDC) return;

    const sinceLastAction = Date.now() - lastUserActionAtRef.current;
    if (sinceLastAction < USER_ACTION_GRACE_MS) return;

    richToast({
      title: 'Received',
      message: `+${delta.toFixed(2)} USDC arrived in your wallet.`,
      variant: 'success',
      duration: 6000,
    });
  }, [usdc, lastUserActionAtRef, richToast]);
}
