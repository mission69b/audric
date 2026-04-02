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
      subtitle="QR codes, payment links, and invoices. Let anyone send you USDC — no app required on their end."
      stats={[]}
      steps={[
        {
          number: '1',
          title: 'Generate QR codes and payment links',
          description:
            'Create a shareable link or QR code for any amount. Custom labels for invoicing.',
        },
        {
          number: '2',
          title: 'Share via any messaging app',
          description:
            'Send the link over WhatsApp, email, Telegram — wherever. No app install needed for the sender.',
        },
        {
          number: '3',
          title: 'Funds arrive in your balance',
          description:
            'USDC settles instantly on Sui. You get a notification the moment it arrives.',
        },
      ]}
      cta="Get notified"
      ctaPrompt="Tell me about receiving payments"
      status="coming-soon"
    />
  );
}
