import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { departureMono } from "./fonts";

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
      // S.204+ — chain the local NewYork serif + DepartureMono
      // variables alongside Geist so `--font-serif` / `--font-mono`
      // stacks in `globals.css` resolve to real OTF assets.
      className={`${geist.variable} ${geistMono.variable} ${departureMono.variable}`}
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
          // [R6.0] Dual attribute: `.dark` class drives Audric's `dark:`
          // utilities + shadow overrides; `data-theme` drives Geist DS
          // ([data-theme="light"] fires the Geist light ramp). next-themes
          // ^0.4 supports the attribute array. Light is the canonical
          // first impression for the consumer product (D-theme: option B):
          // `defaultTheme="light"` means new visitors with no stored choice
          // get light even with system enabled. [R6 audit] enableSystem
          // is true so the settings switcher's "System" option honestly
          // follows the OS when explicitly chosen.
          attribute={["class", "data-theme"]}
          defaultTheme="light"
          disableTransitionOnChange
          enableSystem
        >
          <ZkLoginProviders>
            <TooltipProvider>{children}</TooltipProvider>
          </ZkLoginProviders>
          {/* [v0.7e Persistent Chats Phase 5 / S.247] Sonner Toaster —
              mounted at root so `toast.success(...)` from VisibilityToggle,
              SidebarHistory delete, and any future surface actually
              renders. [R6.11 Batch A] Restyled to the phase2 calm-card +
              signal-glyph aesthetic via `@/components/ui/sonner` (position,
              max-3, theme handled inside the wrapper). */}
          <Toaster />
        </ThemeProvider>
        {/* [v0.7e post-apps/web archive] Vercel Web Analytics — page views
            + custom events. Free for the Hobby tier; <1KB script. Auto-
            disabled in dev. No PII collected. */}
        <Analytics />
      </body>
    </html>
  );
}
