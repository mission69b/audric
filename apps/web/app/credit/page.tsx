import type { Metadata } from 'next';
import { ProductPage } from '@/components/ProductPage';
import { getUsdcRates, formatRate } from '@/lib/product-stats';

export const metadata: Metadata = {
  title: 'Credit — Audric',
  description:
    'Borrow against your USDC savings. Collateralized lending via NAVI Protocol.',
};

export default async function CreditPage() {
  const rates = await getUsdcRates();

  return (
    <ProductPage
      badge="Credit"
      title="Borrow against your balance."
      subtitle="Need liquidity without selling? Borrow against your USDC savings. Collateralized lending via NAVI Protocol, managed by conversation."
      stats={[
        { label: 'Borrow APR', value: rates ? formatRate(rates.borrowApr) : '—' },
        { label: 'Collateral', value: 'USDC' },
        { label: 'Liquidation', value: 'Monitored' },
      ]}
      steps={[
        {
          number: '1',
          title: 'Ask to borrow',
          description:
            '"Borrow $500" or "I need some liquidity." Audric checks your collateral and health factor.',
        },
        {
          number: '2',
          title: 'Review the terms',
          description:
            'See your borrow rate, health factor, and liquidation threshold before approving.',
        },
        {
          number: '3',
          title: 'Repay on your terms',
          description:
            'Pay back anytime — "Repay $200" or "Pay off my loan." Your health factor stays visible in chat so you always know where you stand.',
        },
      ]}
      cta="Check borrowing"
      ctaPrompt="How much can I borrow?"
    />
  );
}
