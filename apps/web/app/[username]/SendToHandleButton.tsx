'use client';

import { useState } from 'react';
import {
  ConnectModal,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useToast } from '@/components/ui/Toast';

/**
 * SPEC 10 D.1 stub — wallet-connect send flow for the public profile page.
 *
 * Why this replaces the original `sui:pay?…` deep-link button (S.74 v1):
 *
 * The deep-link CTA only worked on mobile devices that had a Sui wallet
 * installed AND a `sui:` protocol handler registered (Slush iOS/Android,
 * inconsistent on Phantom). On desktop browsers — where the founder
 * smoked the page — clicking did nothing because no protocol handler
 * exists. Mirroring the `<PayButton>` pattern from `/pay/[slug]` (which
 * uses `@mysten/dapp-kit`'s `ConnectModal` + `useSignAndExecuteTransaction`)
 * gives the visitor a working send flow on every surface:
 *   - Desktop with Slush extension → ConnectModal → wallet popup → sign
 *   - Desktop without a wallet → ConnectModal lists install links
 *   - Mobile with a wallet app → dapp-kit's wallet bridge handles deep-linking
 *
 * Flow:
 *   1. Visitor types USDC amount in the input (always visible).
 *   2. Click "Connect wallet to send" → opens `<ConnectModal>` (dapp-kit).
 *   3. After wallet connects, button label flips to "Send $X.XX USDC".
 *   4. Click → builds a direct USDC `Transaction` (split + transfer)
 *      → wallet popup → user signs → on-chain.
 *   5. Success: inline confirmation with a Suivision link to the txDigest,
 *      plus a "Send again" reset.
 *
 * Coin selection (USDC is fungible — must merge + split):
 *   1. `client.getCoins({ owner, coinType: USDC_TYPE })` returns ALL of
 *      the visitor's USDC coin objects.
 *   2. Sum balances; reject if total < amount.
 *   3. Pick the first as the "primary"; merge all others into it.
 *   4. Split the exact send amount off the primary; transfer the split.
 *   5. Wallet executes the merged-then-split tx atomically. Any leftover
 *      stays in the primary (now-merged) coin and goes back to the visitor.
 *
 * NOT used (deliberate):
 *   - `@mysten/payment-kit` — that helper expects a Payment Registry
 *     entry (slug + nonce + DB-backed verify polling). Profile pages
 *     are open-amount sends with no slug, no DB, no Audric account
 *     required for the visitor. Direct USDC transfer is the right
 *     abstraction.
 *   - `@t2000/sdk` `buildSendTx` — it's identical logic, but importing
 *     the SDK from a client component pulls in `@pythnetwork/pyth-sui-js`
 *     transitively, which uses Node-only APIs (`node:buffer`, `fs`,
 *     `fs/promises`) that webpack can't bundle for the browser. See the
 *     S.73 footnote in `audric-build-tracker.md`. The 15-line coin-select
 *     duplication here is the right trade vs. dragging the SDK into the
 *     client bundle.
 */

const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;

interface SendToHandleButtonProps {
  recipientAddress: string;
  /**
   * Display handle (e.g. `alice@audric`) — shown in the success toast + memo.
   * The parent page resolves the on-chain `<label>.audric.sui` form to the
   * SuiNS V2 short-form display via `displayHandle()` (S.118 follow-up,
   * 2026-05-08) before passing it down. The on-chain NFT name is unchanged.
   */
  handle: string;
}

type Phase =
  | { kind: 'idle'; error: string | null }
  | { kind: 'submitting' }
  | { kind: 'sent'; digest: string };

export function SendToHandleButton({ recipientAddress, handle }: SendToHandleButtonProps) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const { mutate: disconnect } = useDisconnectWallet();
  const { toast } = useToast();
  const [connectOpen, setConnectOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle', error: null });

  const numAmount = Number.parseFloat(amount);
  const isValidAmount = Number.isFinite(numAmount) && numAmount > 0;

  const setError = (error: string | null) => setPhase({ kind: 'idle', error });

  const handleSend = async () => {
    setError(null);

    if (!account) {
      setConnectOpen(true);
      return;
    }
    if (!isValidAmount) {
      setError('Enter a USDC amount.');
      return;
    }

    setPhase({ kind: 'submitting' });

    try {
      const rawAmount = BigInt(Math.floor(numAmount * 10 ** USDC_DECIMALS));
      const coins = await client.getCoins({ owner: account.address, coinType: USDC_TYPE });

      if (coins.data.length === 0) {
        setError(`No USDC in your wallet. You need at least $${numAmount.toFixed(2)} USDC to send to ${handle}.`);
        return;
      }

      const total = coins.data.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
      if (total < rawAmount) {
        const have = (Number(total) / 10 ** USDC_DECIMALS).toFixed(2);
        setError(`Insufficient USDC. You have $${have}, need $${numAmount.toFixed(2)}.`);
        return;
      }

      // eslint-disable-next-line no-restricted-syntax -- CANONICAL-BYPASS: dapp-kit visitor flow, not an Enoki-sponsored audric-user write. The visitor is not signed in to Audric (they may not even have an Audric account). composeTx is for sponsored writes from authenticated Audric users; this is a direct browser-wallet → on-chain transfer signed by the visitor's own wallet (Slush/Phantom/Suiet) via dapp-kit. Mirrors the existing PayButton bypass.
      const tx = new Transaction();
      const primary = tx.object(coins.data[0].coinObjectId);
      if (coins.data.length > 1) {
        tx.mergeCoins(
          primary,
          coins.data.slice(1).map((c) => tx.object(c.coinObjectId)),
        );
      }
      const [sendCoin] = tx.splitCoins(primary, [rawAmount]);
      tx.transferObjects([sendCoin], recipientAddress);

      const result = await signAndExecute({ transaction: tx });

      setPhase({ kind: 'sent', digest: result.digest });
      setAmount('');
      toast(`Sent $${numAmount.toFixed(2)} USDC to ${handle}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      // Wallet popup dismissed — silent (the user explicitly cancelled).
      if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('canceled')) {
        setPhase({ kind: 'idle', error: null });
        return;
      }
      if (msg.includes('insufficient') || msg.includes('Insufficient')) {
        setError('Insufficient USDC balance.');
        return;
      }
      setError(msg);
    }
  };

  if (phase.kind === 'sent') {
    return (
      <div className="space-y-2 rounded-md border border-success-border bg-success-bg p-3 text-center">
        <div className="text-[12px] font-medium text-success-fg">
          ✓ Sent to {handle}
        </div>
        <a
          href={`https://suivision.xyz/txblock/${phase.digest}`}
          target="_blank"
          rel="noreferrer noopener"
          className="block font-mono text-[10px] text-fg-secondary underline-offset-2 hover:underline"
        >
          {`${phase.digest.slice(0, 10)}…${phase.digest.slice(-6)}`} ↗
        </a>
        <button
          type="button"
          onClick={() => setPhase({ kind: 'idle', error: null })}
          className="text-[11px] text-fg-secondary hover:text-fg-primary"
        >
          Send another
        </button>
      </div>
    );
  }

  const submitting = phase.kind === 'submitting' || isPending;
  const buttonLabel = submitting
    ? 'Confirming…'
    : !account
      ? 'Connect wallet to send'
      : isValidAmount
        ? `Send $${numAmount.toFixed(2)} USDC`
        : 'Send USDC';

  return (
    <>
      <ConnectModal open={connectOpen} onOpenChange={setConnectOpen} trigger={<></>} />
      <div className="space-y-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-fg-secondary">
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
            className="w-full rounded-md border border-border-subtle bg-surface-page px-7 py-2 text-[12px] text-fg-primary placeholder:text-fg-muted focus:border-border-strong focus:outline-none disabled:opacity-50"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            USDC
          </span>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={submitting || (!!account && !isValidAmount)}
          className="block w-full rounded-md border border-border-strong bg-fg-primary px-4 py-2.5 text-center text-[12px] font-medium text-fg-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {buttonLabel}
        </button>
        {phase.kind === 'idle' && phase.error && (
          <p className="text-center text-[11px] text-error-fg">{phase.error}</p>
        )}
        {account && (
          <button
            type="button"
            onClick={() => disconnect()}
            className="block w-full text-center text-[10px] text-fg-secondary hover:text-fg-primary"
          >
            Connected: {account.address.slice(0, 6)}…{account.address.slice(-4)} · disconnect
          </button>
        )}
      </div>
    </>
  );
}
