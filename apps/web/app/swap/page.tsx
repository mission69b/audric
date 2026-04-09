import type { Metadata } from 'next';
import { ProductPage } from '@/components/ProductPage';

export const metadata: Metadata = {
  title: 'Swap — Audric',
  description:
    'Convert tokens instantly. Best-route aggregation via Cetus on Sui.',
};

const TOKENS = [
  { symbol: 'SUI', name: 'Sui' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'USDT', name: 'Tether' },
  { symbol: 'wETH', name: 'Wrapped Ethereum' },
  { symbol: 'wBTC', name: 'Wrapped Bitcoin' },
  { symbol: 'CETUS', name: 'Cetus Protocol' },
  { symbol: 'NAVX', name: 'NAVI Protocol' },
  { symbol: 'DEEP', name: 'DeepBook' },
  { symbol: 'SCA', name: 'Scallop' },
  { symbol: 'BUCK', name: 'Bucket USD' },
  { symbol: 'haSUI', name: 'Haedal Staked SUI' },
  { symbol: 'afSUI', name: 'Aftermath Staked SUI' },
];

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
    >
      <section className="mt-12">
        <h2 className="text-lg text-foreground mb-1">Supported tokens</h2>
        <p className="text-sm text-muted mb-6">
          {TOKENS.length} tokens available. Routed via Cetus aggregator for best price.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TOKENS.map((token) => (
            <div
              key={token.symbol}
              className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3 transition-colors hover:bg-surface"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-[10px] font-medium text-foreground border border-border">
                {token.symbol.slice(0, 2)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{token.symbol}</p>
                <p className="font-mono text-[10px] text-muted truncate">{token.name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </ProductPage>
  );
}
