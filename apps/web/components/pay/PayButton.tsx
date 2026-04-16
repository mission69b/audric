'use client';

import { useState, useMemo } from 'react';
import { ConnectModal, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { paymentKit } from '@mysten/payment-kit';

const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;

interface PayButtonProps {
  recipientAddress: string;
  amount: number | null;
  nonce: string;
  slug: string;
  onSuccess: (digest: string, sender: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export function PayButton({ recipientAddress, amount, nonce, slug, onSuccess, onError, disabled }: PayButtonProps) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [connectOpen, setConnectOpen] = useState(false);

  const pkClient = useMemo(() => {
    const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
    const baseUrl = network === 'testnet'
      ? 'https://fullnode.testnet.sui.io:443'
      : 'https://fullnode.mainnet.sui.io:443';
    return new SuiGrpcClient({ network, baseUrl }).$extend(paymentKit());
  }, []);

  const handlePay = async () => {
    if (!account) {
      setConnectOpen(true);
      return;
    }

    if (amount === null || amount <= 0) {
      onError('Invalid payment amount.');
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
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      if (msg.includes('rejected') || msg.includes('cancelled')) {
        return;
      }
      if (msg.includes('Duplicate')) {
        onError('This payment has already been processed.');
        return;
      }
      if (msg.includes('insufficient') || msg.includes('balance')) {
        onError(`Insufficient USDC balance. You need $${amount.toFixed(2)} USDC.`);
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
