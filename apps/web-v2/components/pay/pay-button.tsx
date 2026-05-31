"use client";

/**
 * PayButton — wallet-connect + sign-and-execute flow for the public
 * `/pay/[slug]` page. Ported from `apps/web/components/pay/PayButton.tsx`
 * (Session 4, v0.7c Phase 6).
 *
 * Behaviour preservation:
 *   - Connect-wallet-on-click flow via `ConnectModal` opened with state.
 *   - PaymentKit `processRegistryPayment` PTB (nonce + receiver + amount).
 *   - Error classification: `rejected/cancelled` → silent;
 *     `Duplicate` → "already processed"; `insufficient/balance` → human msg;
 *     anything else → raw message.
 *
 * Trigger pattern: `<span hidden />` wrapped in a `noUselessFragments`
 * exemption — `ConnectModal` requires a non-empty React node for
 * `trigger` but we open it programmatically via state. Same pattern
 * as `app/[username]/send-to-handle-button.tsx`.
 */

import {
  ConnectModal,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { paymentKit } from "@mysten/payment-kit";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { useMemo, useState } from "react";
import { env } from "@/lib/env";

const USDC_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const USDC_DECIMALS = 6;

interface PayButtonProps {
  amount: number | null;
  disabled?: boolean;
  nonce: string;
  onError: (error: string) => void;
  onSuccess: (digest: string, sender: string) => void;
  recipientAddress: string;
  slug: string;
}

export function PayButton({
  recipientAddress,
  amount,
  nonce,
  slug,
  onSuccess,
  onError,
  disabled,
}: PayButtonProps) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();
  const [connectOpen, setConnectOpen] = useState(false);

  const pkClient = useMemo(() => {
    const network = env.NEXT_PUBLIC_SUI_NETWORK;
    const baseUrl =
      network === "testnet"
        ? "https://fullnode.testnet.sui.io:443"
        : "https://fullnode.mainnet.sui.io:443";
    return new SuiGrpcClient({ network, baseUrl }).$extend(paymentKit());
  }, []);

  const handlePay = async () => {
    if (!account) {
      setConnectOpen(true);
      return;
    }

    if (amount === null || amount <= 0) {
      onError("Invalid payment amount.");
      return;
    }

    try {
      const rawAmount = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS));

      const tx = pkClient.paymentKit.tx.processRegistryPayment({
        nonce,
        coinType: USDC_TYPE,
        amount: rawAmount,
        receiver: recipientAddress,
        sender: account.address,
      });

      const result = await signAndExecute({ transaction: tx });

      onSuccess(result.digest, account.address);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("rejected") || msg.includes("cancelled")) {
        return;
      }
      if (msg.includes("Duplicate")) {
        onError("This payment has already been processed.");
        return;
      }
      if (msg.includes("insufficient") || msg.includes("balance")) {
        onError(
          `Insufficient USDC balance. You need $${amount.toFixed(2)} USDC.`
        );
        return;
      }
      onError(msg);
    }
  };

  // [R6.6 / 6a] phase2-pay-public PA1/PA3 — primary CTA reads "Pay with
  // wallet" at rest and swaps to a spinner + "Approve in your wallet…" while
  // the wallet popup is open (PA3 SIGNING). Connect happens on click when
  // there's no account, so the label stays "Pay with wallet" pre-connect.
  const label = isPending ? "Approve in your wallet…" : "Pay with wallet";

  return (
    <>
      <ConnectModal
        onOpenChange={setConnectOpen}
        open={connectOpen}
        trigger={<span hidden />}
      />
      <button
        className="inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-foreground font-medium font-sans text-[15px] text-background tracking-[-0.011em] transition-opacity hover:opacity-90 active:opacity-80 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-progress disabled:opacity-60"
        data-slug={slug}
        disabled={disabled || isPending}
        onClick={handlePay}
        type="button"
      >
        {isPending && (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {label}
      </button>
    </>
  );
}
