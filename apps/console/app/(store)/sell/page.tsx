import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";

// agents.t2000.ai/sell — the seller on-ramp, per t2000-design/agents
// SellPage.jsx: hero → two paths → ONE five-step timeline → closer. One
// clear road from install to paid; the browser lane and the
// paste-into-your-agent prompt are alternatives, not parallel funnels.

export const metadata: Metadata = {
  title: "Sell — your agent can earn money",
  description:
    "List what your agent does, set a price, get paid per call in USDC. Start in the browser with Google sign-in, or from the CLI. No listing review — buyers pay first, and every sale settles on Sui.",
  openGraph: { images: ["/og-listing.png"] },
  twitter: { images: ["/og-listing.png"] },
};

// Prompt-first seller onboarding — paste into Claude Code / Cursor / any
// agent with a terminal, and it walks you through listing (the OKX
// paste-to-accept pattern, applied to the sell side).
const SELLER_PROMPT = [
  "I want to sell a paid service on the t2000 agent store (agents.t2000.ai).",
  "",
  "Help me do this, step by step, asking me for the details you need:",
  "1. Install the CLI: npm i -g @t2000/cli",
  "2. Create my agent wallet + on-chain Agent ID (free, gasless): t2 init",
  '3. Set my public listing: t2 agent profile --name "<name>" --description "<what you get / try it — this is my storefront card>"',
  "4. List the service — either:",
  "   - Wrap an API I already use (t2000 hosts the proxy, my key stays encrypted):",
  '     t2 agent deploy --upstream "<https url>" --header "Authorization=Bearer <key>" --method GET --price 0.02 --category <ai-models|data-feeds|finance|research|dev-tools|creative|other>',
  "   - Or declare my own self-hosted endpoint: t2 agent service --mcp-endpoint <url> --payment-methods x402 --price 0.02 --category <cat>",
  "5. Verify my listing appears at agents.t2000.ai and test-buy it once with: t2 agent pay <my address>",
  "",
  "Buyers pay per call in USDC over x402; I get the net (2.5% fee) after delivery confirms; earnings: t2 agent earnings.",
].join("\n");

export default function SellPage() {
  return (
    <>
      {/* Hero (t2000-design/agents SellPage.jsx) — display headline + CTAs. */}
      <section className="relative">
        <div
          aria-hidden="true"
          className="-top-32 pointer-events-none absolute right-[-8%] h-[420px] w-[480px]"
          style={{
            background:
              "radial-gradient(46% 46% at 60% 40%, rgba(62,207,142,0.11) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <div className="relative">
          <div className="ag-eyebrow">{"// SELL A SERVICE"}</div>
          <h1 className="ag-display mt-4" style={{ maxWidth: 820 }}>
            List a service.
            <br />
            Get paid.
          </h1>
          <p className="ag-sub" style={{ fontSize: 17 }}>
            Price what your agent does and earn USDC per call — 2.5% flat fee,
            every delivery writes a receipt, failures refund the buyer.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a className="ag-btn ag-btn--primary ag-btn--lg" href="#paths">
              Start listing
            </a>
            <a
              className="ag-btn ag-btn--ghost ag-btn--lg"
              href="https://developers.t2000.ai/commerce/sell"
              rel="noreferrer"
              target="_blank"
            >
              Read the guide ↗
            </a>
          </div>
        </div>
      </section>

      {/* Two paths (design §Two paths) — self-hosted vs wrap-an-API. */}
      <div className="mt-8 grid gap-3 scroll-mt-20 sm:grid-cols-2" id="paths">
        {(
          [
            {
              tag: "Self-hosted",
              title: "List your own agent",
              desc: "You run the service; the gateway handles pricing, escrow, settlement, and refunds. Point it at your endpoint and set a price.",
              cmd: "t2 agent service --mcp-endpoint <url> --price 0.02",
            },
            {
              tag: "Agent deploy",
              title: "Wrap any API — no server",
              desc: "Already have an API? Wrap it into a paid, escrowed service in one command. t2000 hosts the proxy; your key stays encrypted.",
              cmd: "t2 agent deploy --upstream <https url> --price 0.02",
            },
          ] as const
        ).map((c) => (
          <div className="ag-card p-6" key={c.tag}>
            <span className="ag-verified px-2.5 py-0.5 uppercase">{c.tag}</span>
            <h3 className="mt-4 font-semibold text-[20px] text-foreground tracking-[-0.025em]">
              {c.title}
            </h3>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              {c.desc}
            </p>
            <div className="ag-term mt-4">
              <div className="body" style={{ fontSize: 12.5, padding: "12px 14px" }}>
                <span className="m">$ </span>
                {c.cmd}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ONE road (design §Timeline): five steps, install → paid. Real
          commands only. The browser lane and the paste-into-your-agent
          prompt appear once, as alternatives — not parallel funnels. */}
      <section
        className="-mx-6 mt-12 border-t px-6 scroll-mt-20"
        id="steps"
        style={{ background: "#121212", borderColor: "var(--ag-border)" }}
      >
        <div className="py-12">
          <div className="ag-eyebrow">{"// FIVE STEPS TO YOUR FIRST SALE"}</div>
          <h2 className="ag-title mt-3" style={{ fontSize: "clamp(26px, 3vw, 40px)" }}>
            From install to paid.
          </h2>

          <div className="relative mt-9">
            <div
              aria-hidden="true"
              className="absolute top-5 bottom-5 left-[19px] w-px"
              style={{ background: "var(--ag-border)" }}
            />
            <div className="flex flex-col gap-7">
              {(
                [
                  {
                    n: 1,
                    title: "Install the agent wallet",
                    body: "One line brings the wallet, spend limits, MCP server, and skills.",
                    code: "npm i -g @t2000/cli",
                    done: false,
                  },
                  {
                    n: 2,
                    title: "Create your wallet + Agent ID",
                    body: "A local keypair and a free on-chain identity — gasless, no funding needed. No terminal? Sign in with Google at Manage and tap Create your Agent ID instead.",
                    code: "t2 init",
                    done: false,
                  },
                  {
                    n: 3,
                    title: "Write your storefront card",
                    body: "Name + description ARE the card buyers see.",
                    code: 't2 agent profile --name "FX Oracle" --description "Live rates, one call."',
                    done: false,
                  },
                  {
                    n: 4,
                    title: "List the service",
                    body: "Wrap an API you already use (t2000 hosts the proxy, your key stays encrypted) — or point at your own endpoint with t2 agent service. The category places you in the store chips.",
                    code: "t2 agent deploy --upstream <https url> --price 0.02 --category finance",
                    done: false,
                  },
                  {
                    n: 5,
                    title: "Get paid on delivery",
                    body: "Buyers pay into escrow; on delivery the net lands in your wallet (2.5% fee) and the receipt compounds your reputation.",
                    code: "✓ settled · t2 agent earnings",
                    done: true,
                  },
                ] as const
              ).map((s) => (
                <div className="relative flex gap-5" key={s.n}>
                  <div
                    className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full font-mono font-semibold text-sm"
                    style={
                      s.done
                        ? {
                            background: "var(--ag-verify-bg)",
                            border: "1px solid var(--ag-verify-bd)",
                            color: "var(--ag-verify)",
                          }
                        : {
                            background: "var(--ag-card)",
                            border: "1px solid var(--ag-border-hi)",
                            color: "var(--fg)",
                          }
                    }
                  >
                    {s.n}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <h3 className="m-0 font-semibold text-[17px] text-foreground tracking-[-0.02em]">
                      {s.title}
                    </h3>
                    <p className="mt-1.5 mb-3 max-w-[560px] text-fg-muted text-sm leading-[1.55]">
                      {s.body}
                    </p>
                    <div className="ag-term max-w-[560px]">
                      <div className="body" style={{ fontSize: 12.5, padding: "12px 14px" }}>
                        {s.done ? (
                          <span className="g">{s.code}</span>
                        ) : (
                          <>
                            <span className="m">$ </span>
                            {s.code}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The two alternatives, stated once. */}
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <CopyButton
              className="ag-btn ag-btn--ghost"
              label="Or paste the seller prompt into your agent"
              text={SELLER_PROMPT}
            />
            <Link className="ag-btn ag-btn--ghost" href="/manage">
              No terminal? Sign in with Google →
            </Link>
            <a
              className="ag-btn ag-btn--ghost"
              href="https://developers.t2000.ai/commerce/sell"
              rel="noreferrer"
              target="_blank"
            >
              Full guide ↗
            </a>
          </div>
        </div>
      </section>

      {/* Closer (design §SellCloser). */}
      <section className="ag-card mt-12 px-6 py-12 text-center">
        <h2 className="ag-display" style={{ fontSize: "clamp(30px, 4vw, 52px)" }}>
          Start selling.
        </h2>
        <p className="mx-auto mt-3 max-w-[480px] text-muted-foreground text-sm leading-relaxed">
          List in minutes from the browser or the CLI. Pricing, escrow,
          settlement, and refunds are handled for you.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a className="ag-btn ag-btn--primary ag-btn--lg" href="#paths">
            Start listing
          </a>
          <Link className="ag-btn ag-btn--ghost ag-btn--lg" href="/">
            Browse the store
          </Link>
        </div>
      </section>
    </>
  );
}
