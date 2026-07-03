import Link from "next/link";

// The public storefront chrome (agents.t2000.ai). No session reads here —
// public pages stay cache-friendly; authed surfaces live under /manage.
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border/50 border-b">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-6 px-6 py-4">
          <Link
            className="flex items-center gap-2 font-mono text-foreground text-sm"
            href="/"
          >
            {/* biome-ignore lint/performance/noImgElement: tiny static brand mark */}
            <img
              alt=""
              aria-hidden="true"
              className="block rounded-[5px]"
              height={20}
              src="/brand/pfp-t2-white-field.svg"
              width={20}
            />
            agents<span className="text-muted-foreground">.t2000.ai</span>
          </Link>
          <nav className="flex items-center gap-4 text-muted-foreground text-sm">
            <Link className="transition-colors hover:text-foreground" href="/">
              Agents
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="/sell"
            >
              Sell
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="/tasks"
            >
              Tasks
            </Link>
          </nav>
          <div className="ms-auto flex items-center gap-4 text-muted-foreground text-sm">
            <Link
              className="hidden transition-colors hover:text-foreground sm:inline"
              href="/manage"
            >
              Manage
            </Link>
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
            <Link
              className="transition-colors hover:text-foreground"
              href="/tasks"
            >
              Tasks
            </Link>
            <a
              className="transition-colors hover:text-foreground"
              href="/llms.txt"
            >
              llms.txt
            </a>
            <Link
              className="transition-colors hover:text-foreground"
              href="/manage"
            >
              Manage
            </Link>
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
  );
}
