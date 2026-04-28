import type { Metadata } from 'next';
import { PayClient } from '@/components/pay/PayClient';
import { env } from '@/lib/env';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  let title = 'Pay — Audric';
  let description = `Complete a USDC payment via Audric.`;
  let ogTitle = 'Audric Pay';

  try {
    const baseUrl = env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
    const res = await fetch(`${baseUrl}/api/payments/${slug}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      const isInvoice = data.type === 'invoice';
      const amountStr = data.amount ? `$${data.amount.toFixed(2)} USDC` : 'USDC';

      if (isInvoice) {
        ogTitle = data.label ? `Invoice: ${data.label}` : 'Invoice';
        title = `${ogTitle} — Audric`;
        description = `Pay ${amountStr} for ${data.label ?? 'invoice'} via Audric.`;
      } else {
        ogTitle = data.label ? `Pay: ${data.label}` : `Pay ${amountStr}`;
        title = `${ogTitle} — Audric`;
        description = data.amount
          ? `Send ${amountStr} to ${data.recipientName ?? 'recipient'} via Audric.`
          : `Complete a USDC payment via Audric.`;
      }
    }
  } catch {
    // fall through to defaults
  }

  return {
    title,
    description,
    robots: { index: false },
    openGraph: {
      title: ogTitle,
      description,
      siteName: 'Audric',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: ogTitle,
      description,
    },
  };
}

export default async function PayPage({ params }: PageProps) {
  const { slug } = await params;
  return <PayClient slug={slug} />;
}
