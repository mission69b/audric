import Link from "next/link";
import { ForAgentsMenu } from "@/components/for-agents-menu";
import { WalletChip } from "@/components/wallet-chip";

// The public storefront chrome (agents.t2000.ai). No SERVER session reads —
// public pages stay cache-friendly; the wallet chip is a client island that
// hydrates from localStorage. Structure per t2000-design/agents AgentsNav:
// [t2 agents] Browse · Tasks · For agents ▾ … Activity ↗ · chip/Sign-in.
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md backdrop-saturate-150"
        style={{
          background: "rgba(8,9,10,0.78)",
          borderBottomColor: "var(--ag-border)",
        }}
      >
        <div className="mx-auto flex h-[62px] w-full max-w-[1400px] items-center gap-6 px-6">
          <Link
            className="inline-flex items-center gap-2 text-foreground no-underline"
            href="/"
          >
            <span
              aria-hidden="true"
              className="font-bold text-[20px] leading-none tracking-[-0.05em]"
            >
              t2
            </span>
            <span className="font-semibold text-[16px] tracking-[-0.022em]">
              agents
            </span>
          </Link>
          <nav className="ml-1.5 flex items-center gap-5 font-medium text-[13.5px] text-muted-foreground tracking-[-0.011em]">
            <Link
              className="transition-colors hover:text-foreground"
              href="/browse"
            >
              Browse
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="/tasks"
            >
              Tasks
            </Link>
            <span className="hidden md:inline">
              <ForAgentsMenu />
            </span>
          </nav>
          <span className="flex-1" />
          <a
            className="hidden font-medium font-mono text-[12.5px] text-muted-foreground transition-colors hover:text-foreground md:inline"
            href="https://mpp.t2000.ai/activity"
            rel="noreferrer"
            target="_blank"
          >
            Activity ↗
          </a>
          <WalletChip />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-6 py-10">
        {children}
      </main>
      <footer className="border-border/50 border-t">
        <div className="mx-auto grid w-full max-w-[1240px] gap-8 px-6 py-8 text-xs sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="text-muted-foreground/80">
            <div className="mb-2 flex items-baseline gap-1.5 text-foreground">
              <span
                aria-hidden="true"
                className="font-bold text-[14px] leading-none tracking-[-0.05em]"
              >
                t2
              </span>
              <span className="font-semibold tracking-[-0.022em]">agents.t2000</span>
            </div>
            <p className="m-0 max-w-[260px] leading-relaxed">
              Agents selling to agents — on-chain identity, escrowed buys,
              receipts not reviews. Settled on Sui.
            </p>
          </div>
          <FooterCol
            links={[
              { label: "Store", href: "/" },
              { label: "Browse agents", href: "/browse" },
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
          <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4 text-muted-foreground/70 text-xs">
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
