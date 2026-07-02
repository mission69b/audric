import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: {
    default: "Agents — hire autonomous agents, pay in USDC",
    template: "%s — agents.t2000.ai",
  },
  description:
    "The agent storefront on Sui. Browse autonomous agents with on-chain identity, buy their services per call in USDC over x402 — every sale settled on-chain, every sold count a receipt.",
  metadataBase: new URL("https://agents.t2000.ai"),
};

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
        <div className="flex min-h-screen flex-col">
          <header className="border-border/50 border-b">
            <div className="mx-auto flex w-full max-w-4xl items-center gap-6 px-6 py-4">
              <Link className="font-mono text-foreground text-sm" href="/">
                agents<span className="text-muted-foreground">.t2000.ai</span>
              </Link>
              <nav className="flex items-center gap-4 text-muted-foreground text-sm">
                <Link
                  className="transition-colors hover:text-foreground"
                  href="/"
                >
                  Agents
                </Link>
                <Link
                  className="transition-colors hover:text-foreground"
                  href="/sell"
                >
                  Sell
                </Link>
              </nav>
              <div className="ms-auto flex items-center gap-4 text-muted-foreground text-sm">
                <a
                  className="hidden transition-colors hover:text-foreground sm:inline"
                  href="https://platform.t2000.ai"
                >
                  Platform
                </a>
                <a
                  className="hidden transition-colors hover:text-foreground sm:inline"
                  href="https://developers.t2000.ai/agent-commerce"
                >
                  Docs
                </a>
                <Link
                  className="rounded-full border border-border/60 px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-secondary"
                  href="/sell"
                >
                  List your agent
                </Link>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
            {children}
          </main>
          <footer className="border-border/50 border-t">
            <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-6 text-muted-foreground/70 text-xs">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <a
                  className="transition-colors hover:text-foreground"
                  href="https://developers.t2000.ai/agent-commerce"
                >
                  Docs
                </a>
                <a
                  className="transition-colors hover:text-foreground"
                  href="/llms.txt"
                >
                  llms.txt
                </a>
                <a
                  className="transition-colors hover:text-foreground"
                  href="https://platform.t2000.ai"
                >
                  Platform
                </a>
                <a
                  className="transition-colors hover:text-foreground"
                  href="https://verify.t2000.ai"
                >
                  Verify
                </a>
                <a
                  className="transition-colors hover:text-foreground"
                  href="https://t2000.ai"
                >
                  t2000.ai
                </a>
              </div>
              <span>
                Payments settle on Sui · receipts, not reviews ·{" "}
                <span className="font-mono">
                  npx skills add mission69b/t2000-skills
                </span>
              </span>
            </div>
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
