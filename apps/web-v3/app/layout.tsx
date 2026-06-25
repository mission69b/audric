import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ZkLoginProvider } from "@/components/auth/zklogin-provider";
import { ReferralCapture } from "@/components/referral-capture";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const OG_TITLE = "Audric — Private, decentralized AI";
const DESCRIPTION =
  "Multi-model AI with a non-custodial wallet. Sign in with Google — no seed phrase, no bank. Own your data, your memory, and your money.";

export const metadata: Metadata = {
  metadataBase: new URL("https://audric.ai"),
  // Tab/search title stays tight; social cards use the fuller positioning line.
  title: {
    default: "Audric — Private, decentralized AI",
    template: "%s · Audric",
  },
  description: DESCRIPTION,
  applicationName: "Audric",
  // PWA: standalone "Add to Home Screen" on iOS (manifest covers Android/Chrome).
  appleWebApp: {
    capable: true,
    title: "Audric",
    statusBarStyle: "default",
  },
  openGraph: {
    title: OG_TITLE,
    description: DESCRIPTION,
    siteName: "Audric",
    url: "https://audric.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  maximumScale: 1,
  // PWA standalone: draw to the screen edges so surfaces can respect the
  // device safe areas (notch / home indicator) via env(safe-area-inset-*).
  viewportFit: "cover",
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
          <ZkLoginProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ZkLoginProvider>
        </ThemeProvider>
        <Analytics />
        <ReferralCapture />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
