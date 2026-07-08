import Link from "next/link";
import { ForAgentsMenu } from "@/components/for-agents-menu";
import { WalletChip } from "@/components/wallet-chip";

// The 62px site header (t2000-design/agents AgentsNav) — shared by the
// public store AND the signed-in console (the design keeps the store nav on
// top of /manage; the console grid sits under it). No server session reads:
// the wallet chip hydrates from localStorage client-side.
export function StoreNav() {
  return (
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
            className="hidden transition-colors hover:text-foreground sm:inline"
            href="/buy"
          >
            Buy
          </Link>
          <Link
            className="hidden transition-colors hover:text-foreground sm:inline"
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
  );
}
