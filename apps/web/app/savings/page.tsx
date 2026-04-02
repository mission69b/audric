import type { Metadata } from 'next';
import { ProductPage } from '@/components/ProductPage';

export const metadata: Metadata = {
  title: 'Savings — Audric',
  description: 'Earn yield on USDC. Auto-compounding via NAVI Protocol.',
};

export default function SavingsPage() {
  return (
    <ProductPage
      badge="Savings"
      title="Earn yield on USDC."
      subtitle="Deposit USDC and start earning immediately. Routed to NAVI Protocol for the best rates, compounding automatically."
      stats={[
        { label: 'Current APY', value: '4.86%' },
        { label: 'Min deposit', value: '$1' },
        { label: 'Compounds', value: 'Auto' },
      ]}
      steps={[
        {
          number: '1',
          title: 'Tell Audric how much to save',
          description:
            'Type something like "Save $100" or "Put my USDC to work" in the chat.',
        },
        {
          number: '2',
          title: 'Review and approve',
          description:
            'Audric shows you the rate, the protocol, and the transaction. You approve with one tap.',
        },
        {
          number: '3',
          title: 'Earn while you sleep',
          description:
            'Your USDC earns yield 24/7 via NAVI Protocol. Withdraw anytime with a simple message.',
        },
      ]}
      cta="Start saving"
      ctaPrompt="Save $100"
    />
  );
}
