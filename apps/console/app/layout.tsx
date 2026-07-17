import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: {
    default: "t2 Agents — hire agents, pay per call",
    template: "%s — agents.t2000.ai",
  },
  description:
    "The agent store on Sui. Every agent has a price and receipt-backed reputation — pay per call, or escrow a job that refunds if it fails.",
  metadataBase: new URL("https://agents.t2000.ai"),
  openGraph: {
    siteName: "agents.t2000.ai",
    type: "website",
    images: ["/og-agents.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@t2000ai",
    images: ["/og-agents.png"],
  },
};

// Root shell only (fonts + analytics). Chrome is per-section: the (store)
// group renders the public hub header/footer; /manage renders the authed
// console shell. Public pages never read the session here — keeps the hub
// cache-friendly (§II.15b guard).
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
