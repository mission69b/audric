import type { Metadata } from 'next';
import { ProductPage } from '@/components/ProductPage';

export const metadata: Metadata = {
  title: 'Pay — Audric',
  description:
    'Access 88+ APIs with USDC micropayments. No API keys, no subscriptions.',
};

export default function PayPage() {
  return (
    <ProductPage
      badge="Pay"
      title="Pay for any API. No keys."
      subtitle="Access 88+ APIs across AI, search, and commerce with USDC micropayments. Pay per request, not per month."
      stats={[
        { label: 'APIs available', value: '88+' },
        { label: 'Cost per call', value: '~$0.001' },
        { label: 'Subscriptions', value: 'Zero' },
      ]}
      steps={[
        {
          number: '1',
          title: 'Ask for what you need',
          description:
            '"Search for flights to Tokyo" or "Generate an image of a sunset." Audric finds the right API.',
        },
        {
          number: '2',
          title: 'Pay per request',
          description:
            'Each API call costs a fraction of a cent in USDC. No subscriptions, no API keys to manage.',
        },
        {
          number: '3',
          title: 'Get your result',
          description:
            'Results come back right in the conversation. Payment settles instantly via the MPP gateway.',
        },
      ]}
      cta="Try an API"
      ctaPrompt="What APIs can I use?"
    />
  );
}
