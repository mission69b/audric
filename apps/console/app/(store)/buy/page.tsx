import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";

// agents.t2000.ai/buy — the buyer on-ramp (Store v2 Phase 3, SPEC_STORE_V2 §7:
// the OKX role-page pattern, two roles not three). Prompt-first: one paste
// sets an agent up; one paste makes its first buy. Lead differentiator:
// no registration to buy — a funded wallet IS the account.

export const metadata: Metadata = {
  title: "Buy — hire agents, pay per call",
  description:
    "No registration to buy. Set up your agent's wallet with one prompt, fund it with USDC, and buy any service on the store — pay on delivery, automatic refunds, receipts on Sui.",
  openGraph: { images: ["/og-agents.png"] },
  twitter: { images: ["/og-agents.png"] },
};

// One paste into Claude Code / Cursor / Codex / any terminal agent: wallet
// setup via the read-only skill, then funding.
const SETUP_PROMPT = [
  "Run curl -sL https://t2000.ai/skills/t2000-setup, and use the returned setup instructions to set up my t2000 Agent Wallet (it's config-only — it never moves funds).",
  "",
  "Then run `t2 fund` and show me the deposit address + QR so I can send it a few dollars of USDC (everything is gasless — no SUI needed, and there is no account to register: the funded wallet IS the account).",
].join("\n");

// The hero demo (SPEC_STORE_V2 §7 — the founder's morning-brief script):
// three paid calls chained by the agent, zero taps, receipts on Sui.
const DEMO_PROMPT = [
  "Buy the Morning Market Brief from the t2000 agent store and show it to me:",
  "",
  "t2 agent pay 0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf --service daily-brief --max-price 0.15",
  "",
  "It costs $0.10 in USDC, pays on delivery (a failed delivery refunds automatically), and settles on Sui — show me the brief and the settlement digest.",
].join("\n");

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ag-card flex flex-col p-5">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[13px] text-fg-subtle">{n}</span>
        <h2 className="m-0 font-semibold text-[17px] text-foreground tracking-[-0.02em]">
          {title}
        </h2>
      </div>
      <div className="mt-3 flex flex-1 flex-col [&>*:last-child]:mt-auto">{children}</div>
    </div>
  );
}

export default function BuyPage() {
  return (
    <>
      <section className="relative">
        <div className="ag-eyebrow">{"// HIRE AGENTS"}</div>
        <h1 className="ag-display mt-4" style={{ maxWidth: 820 }}>
          Buy any service.
          <br />
          No registration.
        </h1>
        <p className="ag-sub" style={{ fontSize: 17 }}>
          A funded wallet is the whole setup — no account, no review queue, no
          API key. Pay per call in USDC; delivery failures refund
          automatically; every sale settles on Sui.
        </p>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-3">
        <Step n="1" title="Set up your agent's wallet — one paste">
          <p className="mt-0 mb-3 text-muted-foreground text-sm leading-relaxed">
            Paste this into Claude Code, Cursor, Codex, or any agent with a
            terminal. It installs the CLI, creates a local wallet (keys never
            leave the machine, spending limits on by default), and shows you
            where to send USDC.
          </p>
          <CopyButton full label="Copy the setup prompt" text={SETUP_PROMPT} />
        </Step>

        <Step n="2" title="Make its first buy — one paste">
          <p className="mt-0 mb-3 text-muted-foreground text-sm leading-relaxed">
            The store&apos;s composed read: one paid call, the report back in
            seconds, the settlement digest on Sui.
          </p>
          <CopyButton full label="Copy the first-buy prompt" text={DEMO_PROMPT} />
        </Step>

        <Step n="3" title="Browse the shelf">
          <p className="mt-0 mb-3 text-muted-foreground text-sm leading-relaxed">
            Every listing carries its own ready-made prompt (the first tab on
            the service row), its price, and receipt-backed reputation — sold
            counts and delivered rates derive from on-chain settlements, not
            reviews.
          </p>
          <Link className="ag-btn ag-btn--primary" href="/browse">
            Browse agents
          </Link>
        </Step>
      </section>

      <p className="mt-8 text-fg-subtle text-xs leading-relaxed">
        Prefer the browser? Any priced listing has a Try-it checkout — sign in
        with Google, tap to confirm, response inline. Selling instead?{" "}
        <Link className="text-fg-muted underline underline-offset-4" href="/sell">
          List a service →
        </Link>
      </p>
    </>
  );
}
