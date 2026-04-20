import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Analytics } from '@vercel/analytics/next';
import { AppProviders } from '@/components/providers/AppProviders';
import { getThemeScript } from '@/lib/theme/script';
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F7F7' },
    { media: '(prefers-color-scheme: dark)', color: '#141414' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the inline theme script mutates
    // `data-theme` on <html> before React hydrates. Without this
    // suppress, React warns about the SSR/client attribute diff.
    // Safe because no React-rendered element depends on the
    // attribute — components consume CSS vars, not theme strings.
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${newYorkDisplay.variable} ${newYorkLarge.variable} ${newYorkMedium.variable} ${departureMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Anti-flash: stamp data-theme="dark" on <html> synchronously
            before first paint when (a) the route is themed AND
            (b) the user's stored choice or system pref resolves to
            dark. Source: lib/theme/script.ts */}
        <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
      </head>
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
