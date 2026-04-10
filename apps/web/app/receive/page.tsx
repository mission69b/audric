import type { Metadata } from 'next';
import { ProductPage } from '@/components/ProductPage';

export const metadata: Metadata = {
  title: 'Receive — Audric',
  description:
    'Accept USDC payments with QR codes, payment links, and invoices.',
};

export default function ReceivePage() {
  return (
    <ProductPage
      badge="Receive"
      title="Accept payments anywhere."
      subtitle="Payment links, invoices, and QR codes. Anyone can pay you in USDC — no app, no wallet, no friction on their end."
      stats={[
        { label: 'Fee', value: 'Free' },
        { label: 'Settlement', value: '<1s' },
        { label: 'Network', value: 'Sui' },
      ]}
      steps={[
        {
          number: '1',
          title: 'Ask Audric to create a payment link or invoice',
          description:
            'Just say it — "Create a payment link for $50 USDC" or "Invoice $200 due in 7 days." Audric generates a shareable link instantly.',
        },
        {
          number: '2',
          title: 'Share via any messaging app',
          description:
            'Send the link over WhatsApp, email, Telegram — anywhere. The sender opens it in their browser and pays with any Sui wallet. No Audric account needed on their end.',
        },
        {
          number: '3',
          title: 'Auto-detected and confirmed',
          description:
            'Audric watches the chain. The moment USDC lands in your wallet, the link shows as paid — no manual checking, no webhooks to configure.',
        },
        {
          number: '4',
          title: 'Manage everything by conversation',
          description:
            'List, cancel, or check the status of any payment link or invoice just by asking. Audric handles the rest.',
        },
      ]}
      cta="Create a payment link"
      ctaPrompt="Create a payment link for 50 USDC with the label Consulting fee"
      status="live"
    />
  );
}
