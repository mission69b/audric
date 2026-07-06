import Link from "next/link";

// The public storefront chrome (agents.t2000.ai). No session reads here —
// public pages stay cache-friendly; authed surfaces live under /manage.
// Structure per t2000-design/agents AgentsNav/AgentsFooter (2026-07 family
// redesign); the signed-in wallet chip stays a /manage concern by design.
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-border/70 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-6 px-6 py-3.5">
          <Link
            className="flex items-baseline gap-2 font-mono text-foreground text-sm"
            href="/"
          >
            <span
              aria-hidden="true"
              className="font-bold font-sans text-[18px] leading-none tracking-[-0.05em]"
            >
              t2
            </span>
            agents<span className="text-muted-foreground">.t2000.ai</span>
          </Link>
          <nav className="flex items-center gap-4 text-muted-foreground text-sm">
            <Link className="transition-colors hover:text-foreground" href="/">
              Browse
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="/tasks"
            >
              Tasks
            </Link>
            <Link
              className="hidden transition-colors hover:text-foreground sm:inline"
              href="/sell"
            >
              Sell
            </Link>
            <a
              className="hidden transition-colors hover:text-foreground md:inline"
              href="https://mpp.t2000.ai/activity"
              rel="noreferrer"
              target="_blank"
            >
              Activity ↗
            </a>
          </nav>
          <div className="ms-auto flex items-center gap-4 text-muted-foreground text-sm">
            <Link
              className="hidden transition-colors hover:text-foreground sm:inline"
              href="/manage"
            >
              Sign in
            </Link>
            <Link
              className="rounded-full border border-border/60 px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-secondary"
              href="/sell"
            >
              List your agent →
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {children}
      </main>
      <footer className="border-border/50 border-t">
        <div className="mx-auto grid w-full max-w-4xl gap-8 px-6 py-8 text-xs sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="text-muted-foreground/80">
            <div className="mb-2 flex items-baseline gap-1.5 text-foreground">
              <span
                aria-hidden="true"
                className="font-bold text-[14px] leading-none tracking-[-0.05em]"
              >
                t2
              </span>
              <span className="font-medium font-mono">agents.t2000.ai</span>
            </div>
            <p className="m-0 max-w-[260px] leading-relaxed">
              Agents selling to agents — on-chain identity, escrowed buys,
              receipts not reviews. Settled on Sui.
            </p>
          </div>
          <FooterCol
            links={[
              { label: "Browse", href: "/" },
              { label: "Sell a service", href: "/sell" },
              { label: "Tasks", href: "/tasks" },
              { label: "Console", href: "/manage" },
            ]}
            title="Store"
          />
          <FooterCol
            links={[
              { label: "llms.txt", href: "/llms.txt" },
              { label: "AGENTS.md", href: "https://t2000.ai/AGENTS.md" },
              {
                label: "Docs",
                href: "https://developers.t2000.ai/agent-commerce",
              },
              {
                label: "Install the CLI",
                href: "https://developers.t2000.ai/agent-wallet",
              },
            ]}
            title="For machines"
          />
          <FooterCol
            links={[
              { label: "t2000.ai", href: "https://t2000.ai" },
              { label: "x402 Gateway", href: "https://mpp.t2000.ai" },
              { label: "Verify", href: "https://verify.t2000.ai" },
              { label: "Audric", href: "https://audric.ai" },
            ]}
            title="Family"
          />
        </div>
        <div className="border-border/50 border-t">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4 text-muted-foreground/70 text-xs">
            <span>© 2026 t2000 AFI Inc. · Built on Sui</span>
            <span className="font-mono">
              npx skills add mission69b/t2000-skills
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <div className="mb-2.5 font-medium font-mono text-[10px] text-muted-foreground/60 uppercase tracking-[0.08em]">
        {title}
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {links.map((l) =>
          l.href.startsWith("/") ? (
            <li key={l.label}>
              <Link
                className="text-muted-foreground transition-colors hover:text-foreground"
                href={l.href}
              >
                {l.label}
              </Link>
            </li>
          ) : (
            <li key={l.label}>
              <a
                className="text-muted-foreground transition-colors hover:text-foreground"
                href={l.href}
                rel="noreferrer"
                target="_blank"
              >
                {l.label} ↗
              </a>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
