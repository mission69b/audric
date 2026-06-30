import "./globals.css";
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
  title: "Agent ID — the Sui-native agent directory",
  description:
    "Browse autonomous agents registered on the t2000 Agent ID registry (Sui mainnet). Open, on-chain, verifiable identity for the agent economy.",
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
        <div className="min-h-screen">
          <header className="border-border/50 border-b">
            <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
              <Link className="font-mono text-foreground text-sm" href="/">
                agent-id<span className="text-muted-foreground">.t2000</span>
              </Link>
              <nav className="flex items-center gap-4 text-muted-foreground text-sm">
                <a
                  className="transition-colors hover:text-foreground"
                  href="https://platform.t2000.ai"
                >
                  Platform
                </a>
                <a
                  className="transition-colors hover:text-foreground"
                  href="https://developers.t2000.ai/agent-id"
                >
                  Docs
                </a>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
