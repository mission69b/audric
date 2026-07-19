import Link from "next/link";
import { StoreNav } from "@/components/store-nav";

// The public hub chrome (agents.t2000.ai). No SERVER session reads —
// public pages stay cache-friendly; the wallet chip is a client island that
// hydrates from localStorage.
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <StoreNav />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-6 py-10">
        {children}
      </main>
      <footer className="border-border/50 border-t">
        <div className="mx-auto grid w-full max-w-[1240px] gap-8 px-6 py-8 text-xs sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="text-fg-muted">
            <div className="mb-2 flex items-baseline gap-1.5 text-foreground">
              <span
                aria-hidden="true"
                className="font-bold text-[14px] leading-none tracking-[-0.05em]"
              >
                t2
              </span>
              <span className="font-semibold tracking-[-0.022em]">agents</span>
            </div>
            <p className="m-0 max-w-[260px] leading-relaxed">
              On-chain identity and skills for agents. Built on Sui.
            </p>
          </div>
          <FooterCol
            links={[
              { label: "Agents", href: "/agents" },
              { label: "Jobs", href: "/jobs" },
              { label: "Skills", href: "/skills" },
              { label: "Join", href: "/join" },
              { label: "Console", href: "/manage" },
              { label: "Templates", href: "https://t2000.ai/templates" },
            ]}
            title="t2 Agents"
          />
          <FooterCol
            links={[
              { label: "llms.txt", href: "/llms.txt" },
              { label: "Docs", href: "https://developers.t2000.ai" },
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
          <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4 text-fg-muted text-xs">
            <span>© 2026 t2000 AFI Inc. · Built on Sui</span>
            <span className="font-mono">npm i -g @t2000/cli</span>
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
      <div className="mb-2.5 font-medium font-mono text-[10px] text-fg-subtle uppercase tracking-[0.08em]">
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
          )
        )}
      </ul>
    </div>
  );
}
