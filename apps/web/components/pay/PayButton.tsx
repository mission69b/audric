'use client';

import { useState } from 'react';
import { ConnectModal, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;

interface PayButtonProps {
  recipientAddress: string;
  amount: number | null;
  slug: string;
  onSuccess: (digest: string, sender: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export function PayButton({ recipientAddress, amount, slug, onSuccess, onError, disabled }: PayButtonProps) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [connectOpen, setConnectOpen] = useState(false);

  const handlePay = async () => {
    if (!account) {
      setConnectOpen(true);
      return;
    }

    if (amount === null || amount <= 0) {
      onError('Cannot pay with wallet for open-amount links. Please send USDC manually.');
      return;
    }

    try {
      const rawAmount = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS));

      const { data: coins } = await client.getCoins({
        owner: account.address,
        coinType: USDC_TYPE,
      });

      if (coins.length === 0) {
        onError('No USDC found in your wallet.');
        return;
      }

      const totalBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
      if (totalBalance < rawAmount) {
        const available = Number(totalBalance) / 10 ** USDC_DECIMALS;
        onError(`Insufficient USDC. You have $${available.toFixed(2)} but need $${amount.toFixed(2)}.`);
        return;
      }

      const tx = new Transaction();

      const primaryCoin = tx.object(coins[0].coinObjectId);
      if (coins.length > 1) {
        tx.mergeCoins(primaryCoin, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
      }

      const [sendCoin] = tx.splitCoins(primaryCoin, [rawAmount]);
      tx.transferObjects([sendCoin], recipientAddress);

      const result = await signAndExecute({
        transaction: tx,
      });

      onSuccess(result.digest, account.address);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      if (msg.includes('rejected') || msg.includes('cancelled')) {
        return;
      }
      onError(msg);
    }
  };

  const label = isPending
    ? 'Confirming...'
    : account
      ? `Pay${amount ? ` $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''} with Wallet`
      : 'Connect Wallet to Pay';

  return (
    <>
      <ConnectModal
        open={connectOpen}
        onOpenChange={setConnectOpen}
        trigger={<></>}
      />
      <button
        onClick={handlePay}
        disabled={disabled || isPending}
        data-slug={slug}
        className="w-full py-3 rounded-lg bg-foreground text-background text-xs font-mono uppercase tracking-wider hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {label}
      </button>
    </>
  );
}
