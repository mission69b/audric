"use client";

import {
  ConnectModal,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";

/**
 * Wallet-connect send flow for the public profile page (Phase 6
 * Session 3, ported from `audric/apps/web/app/[username]/SendToHandleButton.tsx`).
 *
 * Why dapp-kit and not Enoki / sponsored tx
 * ------------------------------------------
 * The visitor on `/<username>` may not be an Audric account holder.
 * Enoki-sponsored writes require a zkLogin session; this surface uses
 * the visitor's OWN browser wallet (Slush / Phantom / Suiet) via
 * dapp-kit. Mirrors the `<PayButton>` pattern from `/pay/[slug]`.
 *
 * Why direct USDC `Transaction` not `sdk.send()`
 * ----------------------------------------------
 * Importing `@t2000/sdk` from a client component pulls in
 * `@pythnetwork/pyth-sui-js` transitively, which uses Node-only APIs
 * (`node:buffer`, `fs`) that webpack can't bundle for the browser. The
 * 15-line coin-select duplication here is the right trade vs. dragging
 * the SDK into the client bundle. (Apps/web hit this bug in S.73 first.)
 *
 * v0.7c Session 3 simplification: the apps/web original also fires a
 * floating Toast on success. Web-v2 drops the toast — the inline
 * "✓ Sent" panel + Suivision link + Send-another button already convey
 * success on the same screen. One less component to port.
 */

const USDC_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const USDC_DECIMALS = 6;

interface SendToHandleButtonProps {
  /**
   * Display handle (e.g. `alice@audric`) — shown in the success panel.
   * The parent page resolves the on-chain `<label>.audric.sui` form to
   * the short-form display via `displayHandle` before passing it down.
   */
  handle: string;
  recipientAddress: string;
}

type Phase =
  | { kind: "idle"; error: string | null }
  | { kind: "submitting" }
  | { kind: "sent"; digest: string };

export function SendToHandleButton({
  recipientAddress,
  handle,
}: SendToHandleButtonProps) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();
  const { mutate: disconnect } = useDisconnectWallet();
  const [connectOpen, setConnectOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle", error: null });

  const numAmount = Number.parseFloat(amount);
  const isValidAmount = Number.isFinite(numAmount) && numAmount > 0;

  const setError = (error: string | null) => setPhase({ kind: "idle", error });

  const handleSend = async () => {
    setError(null);

    if (!account) {
      setConnectOpen(true);
      return;
    }
    if (!isValidAmount) {
      setError("Enter a USDC amount.");
      return;
    }

    setPhase({ kind: "submitting" });

    try {
      const rawAmount = BigInt(Math.floor(numAmount * 10 ** USDC_DECIMALS));
      const coins = await client.getCoins({
        owner: account.address,
        coinType: USDC_TYPE,
      });

      if (coins.data.length === 0) {
        setError(
          `No USDC in your wallet. You need at least $${numAmount.toFixed(2)} USDC to send to ${handle}.`
        );
        return;
      }

      const total = coins.data.reduce(
        (sum, c) => sum + BigInt(c.balance),
        BigInt(0)
      );
      if (total < rawAmount) {
        const have = (Number(total) / 10 ** USDC_DECIMALS).toFixed(2);
        setError(
          `Insufficient USDC. You have $${have}, need $${numAmount.toFixed(2)}.`
        );
        return;
      }

      const tx = new Transaction();
      const primary = tx.object(coins.data[0].coinObjectId);
      if (coins.data.length > 1) {
        tx.mergeCoins(
          primary,
          coins.data.slice(1).map((c) => tx.object(c.coinObjectId))
        );
      }
      const [sendCoin] = tx.splitCoins(primary, [rawAmount]);
      tx.transferObjects([sendCoin], recipientAddress);

      const result = await signAndExecute({ transaction: tx });

      setPhase({ kind: "sent", digest: result.digest });
      setAmount("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (
        msg.includes("rejected") ||
        msg.includes("cancelled") ||
        msg.includes("canceled")
      ) {
        setPhase({ kind: "idle", error: null });
        return;
      }
      if (msg.includes("insufficient") || msg.includes("Insufficient")) {
        setError("Insufficient USDC balance.");
        return;
      }
      setError(msg);
    }
  };

  if (phase.kind === "sent") {
    return (
      <div className="space-y-2 rounded-md border border-success/30 bg-success/10 p-3 text-center">
        <div className="font-medium text-[12px] text-success">
          ✓ Sent to {handle}
        </div>
        <a
          className="block font-mono text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          href={`https://suivision.xyz/txblock/${phase.digest}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          {`${phase.digest.slice(0, 10)}…${phase.digest.slice(-6)}`} ↗
        </a>
        <button
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setPhase({ kind: "idle", error: null })}
          type="button"
        >
          Send another
        </button>
      </div>
    );
  }

  const submitting = phase.kind === "submitting" || isPending;
  let buttonLabel: string;
  if (submitting) {
    buttonLabel = "Confirming…";
  } else if (!account) {
    buttonLabel = "Connect wallet to send";
  } else if (isValidAmount) {
    buttonLabel = `Send $${numAmount.toFixed(2)} USDC`;
  } else {
    buttonLabel = "Send USDC";
  }

  // ConnectModal requires a `trigger` prop but we open it programmatically
  // via setConnectOpen — pass an empty span instead of an unrenderable fragment.
  const hiddenTrigger = <span hidden />;

  return (
    <>
      <ConnectModal
        onOpenChange={setConnectOpen}
        open={connectOpen}
        trigger={hiddenTrigger}
      />
      <div className="space-y-2">
        <div className="relative">
          <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-[12px] text-muted-foreground">
            $
          </span>
          <input
            className="w-full rounded-md border border-border bg-background px-7 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none disabled:opacity-50"
            disabled={submitting}
            inputMode="decimal"
            min="0"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            step="0.01"
            type="number"
            value={amount}
          />
          <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
            USDC
          </span>
        </div>
        <button
          className="block w-full rounded-md border border-border bg-foreground px-4 py-2.5 text-center font-medium text-[12px] text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={submitting || (!!account && !isValidAmount)}
          onClick={handleSend}
          type="button"
        >
          {buttonLabel}
        </button>
        {phase.kind === "idle" && phase.error && (
          <p className="text-center text-[11px] text-destructive">
            {phase.error}
          </p>
        )}
        {account && (
          <button
            className="block w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => disconnect()}
            type="button"
          >
            Connected: {account.address.slice(0, 6)}…{account.address.slice(-4)}{" "}
            · disconnect
          </button>
        )}
      </div>
    </>
  );
}
