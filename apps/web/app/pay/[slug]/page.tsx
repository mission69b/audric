import type { Metadata } from 'next';
import { PaymentLinkClient } from './PaymentLinkClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Pay — Audric`,
    description: `Complete a USDC payment via Audric payment link ${slug}.`,
    robots: { index: false },
  };
}

export default async function PaymentLinkPage({ params }: PageProps) {
  const { slug } = await params;
  return <PaymentLinkClient slug={slug} />;
}
