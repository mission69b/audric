import Link from "next/link";
import type { ReactNode } from "react";

// Public Agent ID directory shell (gate 8a) — the Sui-native agent explorer.
// No auth (public browse); served at platform.t2000.ai/agents now, alias-able to
// id.t2000.ai later.
export default function AgentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-border/50 border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link className="font-mono text-foreground text-sm" href="/agents">
            agent-id<span className="text-muted-foreground">.t2000</span>
          </Link>
          <nav className="flex items-center gap-4 text-muted-foreground text-sm">
            <Link className="transition-colors hover:text-foreground" href="/">
              Platform
            </Link>
            <a
              className="transition-colors hover:text-foreground"
              href="https://developers.t2000.ai"
            >
              Docs
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
