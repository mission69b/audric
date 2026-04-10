import type { Metadata } from 'next';
import { InvoiceClient } from './InvoiceClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: 'Invoice — Audric',
    description: `View and pay invoice ${slug} via Audric.`,
    robots: { index: false },
  };
}

export default async function InvoicePage({ params }: PageProps) {
  const { slug } = await params;
  return <InvoiceClient slug={slug} />;
}
