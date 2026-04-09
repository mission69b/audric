import type { Metadata } from 'next';
import { ProductPage } from '@/components/ProductPage';

export const metadata: Metadata = {
  title: 'Swap — Audric',
  description:
    'Convert tokens instantly. Best-route aggregation via Cetus on Sui.',
};

export default function SwapPage() {
  return (
    <ProductPage
      badge="Swap"
      title="Convert tokens. Best price."
      subtitle="Swap between any tokens on Sui. Audric finds the best route via Cetus aggregator — you just say what you want."
      stats={[
        { label: 'Fee', value: '0.1%' },
        { label: 'Settlement', value: '<1 sec' },
        { label: 'Routing', value: 'Best price' },
      ]}
      steps={[
        {
          number: '1',
          title: 'Say what you want to swap',
          description:
            '"Swap $50 USDC to SUI" or "Convert my SUI to USDC." Audric handles the routing.',
        },
        {
          number: '2',
          title: 'Review the rate',
          description:
            'See the exchange rate, price impact, and minimum received before approving.',
        },
        {
          number: '3',
          title: 'Instant settlement',
          description:
            'Tokens arrive in your wallet in under a second. Transaction verified on Sui mainnet.',
        },
      ]}
      cta="Swap tokens"
      ctaPrompt="Swap USDC to SUI"
    />
  );
}
