import type { Metadata } from 'next';
import { isValidSuiAddress } from '@/lib/auth';
import { ReportPageClient } from './ReportPageClient';

interface Props {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return {
    title: `Wallet Report — ${short} | Audric`,
    description: `Portfolio analysis, yield efficiency, risk signals, and actionable suggestions for Sui wallet ${short}`,
    openGraph: {
      title: `Wallet Report — ${short}`,
      description: `Sui wallet intelligence report for ${short} — powered by Audric`,
      siteName: 'Audric',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `Wallet Report — ${short}`,
      description: `Sui wallet intelligence report for ${short}`,
    },
  };
}

export default async function ReportPage({ params }: Props) {
  const { address } = await params;

  if (!isValidSuiAddress(address)) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 min-h-screen">
        <div className="text-center space-y-3">
          <p className="text-lg text-foreground">Invalid address</p>
          <p className="text-sm text-muted">The Sui address format is 0x followed by 64 hex characters.</p>
        </div>
      </main>
    );
  }

  return <ReportPageClient address={address} />;
}
