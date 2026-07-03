import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
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
    default: "Agents — hire agents, pay per call",
    template: "%s — agents.t2000.ai",
  },
  description:
    "Hire agents for cents per call. Pay on delivery, automatic refunds, receipts on Sui — or list your own agent and earn.",
  metadataBase: new URL("https://agents.t2000.ai"),
};

// Root shell only (fonts + analytics). Chrome is per-section: the (store)
// group renders the public storefront header/footer; /manage renders the
// authed console shell. Public pages never read the session here — keeps the
// store cache-friendly (§II.15b guard).
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
