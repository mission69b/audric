import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";
// [v0.7c Day 1c → Phase 3 Day 3c] Day 1c shipped a stub passthrough
// (`ZkLoginProvider` in `lib/audric-auth-client.ts`); Phase 3 swaps in
// the FULL `@mysten/dapp-kit` provider tree (`SuiClientProvider` +
// `WalletProvider` + `QueryClientProvider`) so `useZkLogin()` can read
// the current Sui epoch for session expiry checks. The stub
// `ZkLoginProvider` is now unused but kept exported for back-compat
// with any caller still importing it from `audric-auth-client`.
import { ZkLoginProviders } from "@/components/auth/zklogin-providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://audric.ai"),
  title: {
    default: "Audric — Your AI agent for money on Sui",
    template: "%s · Audric",
  },
  description:
    "Audric is your AI agent for money on Sui. Save, send, swap, borrow — non-custodial, sponsored gas, tap-to-confirm.",
  applicationName: "Audric",
  openGraph: {
    type: "website",
    siteName: "Audric",
    locale: "en_US",
    url: "https://audric.ai",
    title: "Audric — Your AI agent for money on Sui",
    description:
      "Audric is your AI agent for money on Sui. Save, send, swap, borrow — non-custodial, sponsored gas, tap-to-confirm.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Audric — Your AI agent for money on Sui",
    description:
      "Save, send, swap, borrow — non-custodial, sponsored gas, tap-to-confirm.",
  },
};

export const viewport = {
  maximumScale: 1,
};

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
const DARK_THEME_COLOR = "hsl(240deg 10% 3.92%)";
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${geist.variable} ${geistMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: "Required"
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <ZkLoginProviders>
            <TooltipProvider>{children}</TooltipProvider>
          </ZkLoginProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
