import type { Metadata, Viewport } from 'next';
import { Instrument_Serif } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Analytics } from '@vercel/analytics/next';
import { AppProviders } from '@/components/providers/AppProviders';
import './globals.css';

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Audric — Your money, handled.',
  description: 'Earn yield on USDC. Pay for APIs. Send instantly. All by conversation.',
  metadataBase: new URL('https://audric.ai'),
  openGraph: {
    title: 'Audric',
    description: 'Your money, handled. Earn yield, pay for APIs, send instantly — all by conversation.',
    siteName: 'Audric',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Audric',
    description: 'Your money, handled.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
