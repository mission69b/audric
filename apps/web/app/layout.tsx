import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Analytics } from '@vercel/analytics/next';
import { AppProviders } from '@/components/providers/AppProviders';
import { newYorkDisplay, newYorkLarge, newYorkMedium, departureMono } from './fonts';
import './globals.css';

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
    site: '@AudricAI',
    title: 'Audric',
    description: 'Your money, handled.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${newYorkDisplay.variable} ${newYorkLarge.variable} ${newYorkMedium.variable} ${departureMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-surface-page text-fg-primary font-sans">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-fg-primary focus:text-fg-inverse focus:rounded-md focus:font-mono focus:text-xs">
          Skip to content
        </a>
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
