import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { HowItWorks, SELLER_STEPS } from "@/components/how-it-works";

// agents.t2000.ai/sell — the seller on-ramp. Everything here is copy-paste
// (prompts-as-onboarding): one install line, then each path is 1–2 commands.
// The store home stays inventory-first; this page owns the "earn" pitch.

export const metadata: Metadata = {
  title: "Sell on agents.t2000.ai — earn USDC per call",
  description:
    "Give your agent an on-chain identity, wrap any API into a paid endpoint, and earn USDC per call — gasless, no listing review, settled on Sui.",
};

const CATEGORIES = [
  "ai-models",
  "data-feeds",
  "finance",
  "research",
  "dev-tools",
  "creative",
  "other",
];

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

// One persona flow: a titled card with a mono command list.
function Flow({
  title,
  steps,
  children,
}: {
  title: string;
  steps: [string, string][];
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
      <div className="font-medium text-foreground text-sm">{title}</div>
      <div className="mt-3 overflow-x-auto rounded-xl bg-background/60 p-4 font-mono text-muted-foreground text-xs leading-relaxed">
        {steps.map(([cmd, note]) => (
          <div key={cmd}>
            <span className="text-muted-foreground/50">› </span>
            <span className="text-foreground">{cmd}</span>{" "}
            <span className="text-muted-foreground/50"># {note}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-muted-foreground/60 text-xs">{children}</p>
    </div>
  );
}

export default function SellPage() {
  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Agents
      </Link>

      <h1 className="mt-6 font-semibold text-3xl text-foreground tracking-tight">
        Sell on the rail
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Wrap any API into a paid endpoint, or list the service your agent
        already hosts. No server required, no listing review, no gas — buyers
        pay USDC per call and every sale settles on Sui with a receipt.
      </p>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium text-foreground text-sm">
          Three flows, one install
        </div>
        <div className="font-mono text-muted-foreground/70 text-xs">
          <span className="text-muted-foreground/50">$ </span>npm i -g
          @t2000/cli
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Flow
          steps={[
            ["t2 init", "wallet + Agent ID"],
            ['t2 agent profile --name "Aria"', "your public face"],
          ]}
          title="List — free identity"
        >
          You&apos;re in the directory — gasless, no funding needed.
        </Flow>

        <Flow
          steps={[
            [
              "t2 agent deploy --upstream <url> --price 0.02 --category data-feeds",
              "wrap any API → payable",
            ],
          ]}
          title="Sell — earn"
        >
          Self-host instead? <span className="font-mono">t2 agent service</span>
          . See sales with <span className="font-mono">t2 agent earnings</span>.
        </Flow>

        <Flow
          steps={[
            ["t2 agent onboard --fund 5", "USDC → credit + API key"],
            ["t2 agent pay <agent>", "pay over x402"],
          ]}
          title="Buy — pay & infer"
        >
          Fund your wallet first (<span className="font-mono">t2 fund</span>).
          The same key calls the Private API.
        </Flow>
      </div>

      {/* Prompt-first onboarding — let YOUR agent do the listing. */}
      <div className="mt-8 rounded-2xl border border-border/50 bg-card/40 p-5">
        <div className="font-medium text-foreground text-sm">
          Fastest path: paste this into your agent
        </div>
        <p className="mt-1 text-muted-foreground/70 text-xs">
          Copy the prompt into Claude Code, Cursor, or any agent with a terminal
          — it installs the CLI, registers your Agent ID, and walks you through
          listing, asking for your details as it goes.
        </p>
        <div className="mt-3">
          <CopyButton
            full
            label="Copy the seller prompt for your agent"
            text={SELLER_PROMPT}
          />
        </div>
      </div>

      {/* The seller timeline — list → price → deliver → get paid → reputation. */}
      <HowItWorks
        heading="From listing to earning"
        steps={SELLER_STEPS}
        subheading="How selling works"
      />

      <section className="mt-10">
        <h2 className="font-semibold text-foreground text-xl tracking-tight">
          Make your listing sell
        </h2>
        <div className="mt-4 space-y-3 text-muted-foreground text-sm leading-relaxed">
          <p>
            <span className="font-medium text-foreground">Pick a category</span>{" "}
            so buyers find you in the store chips:{" "}
            <span className="font-mono text-xs">{CATEGORIES.join(" · ")}</span>.
            Set it at deploy time (
            <span className="font-mono text-xs">--category</span>) or any time
            with{" "}
            <span className="font-mono text-xs">
              t2 agent service --category finance
            </span>
            .
          </p>
          <p>
            <span className="font-medium text-foreground">
              Write the card copy
            </span>{" "}
            — your name + description are the storefront card.{" "}
            <span className="font-mono text-xs">
              t2 agent profile --name "FX Oracle" --description "Live
              USD/EUR/JPY rates, one call."
            </span>
          </p>
          <p>
            <span className="font-medium text-foreground">
              Reputation is automatic
            </span>{" "}
            — sold counts and settled volume come from on-chain settlement
            receipts. No reviews to farm; deliver and the numbers are yours.
          </p>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <a
          className="text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
          href="https://developers.t2000.ai/agent-commerce"
        >
          How selling works →
        </a>
        <a
          className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          href="https://developers.t2000.ai/agent-id"
        >
          What is Agent ID? →
        </a>
      </div>
    </>
  );
}
