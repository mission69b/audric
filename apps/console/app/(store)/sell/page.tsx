import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { SellFlow } from "@/components/sell-flow";

// [SPEC_T2_AGENTS_STORE Phase 1] /sell — the ONE sell path (§2.1 invariant).
// Paste a URL, get listed. No account, no sign-in: the API is the account.

export const metadata: Metadata = {
  title: "Sell your API — t2 Agents",
  description:
    "Paste your paid API's URL and get listed on t2 Agents — no account, no sign-up. Buyers pay USDC per call, straight to your wallet.",
};

const AGENT_PROMPT =
  "Fetch https://mpp.t2000.ai/sellers.md and follow it to make my API sell on t2 Agents: add the x402 402 envelope, verify payments on-chain, then submit my endpoint URL and show me every gate result and my store page link.";

export default function SellPage() {
  return (
    <div className="mx-auto max-w-[760px]">
      <section className="pt-8">
        <div className="ag-eyebrow">{"// SELL ON T2 AGENTS"}</div>
        <h1
          className="ag-title mt-2"
          style={{ fontSize: "clamp(30px, 4vw, 44px)" }}
        >
          Paste a URL. Start selling.
        </h1>
        <p className="mt-3 max-w-[560px] text-[14px] text-muted-foreground leading-relaxed">
          If your API answers 402 with an x402 payment challenge, it can sell
          here — no account, no sign-up, no keys. Buyers pay USDC per call,
          straight to your wallet, and every sale lands on your on-chain track
          record.
        </p>
      </section>

      <section className="pt-7">
        <SellFlow />
      </section>

      <section className="grid gap-3 pt-6 pb-4">
        <div className="ag-card grid gap-3 p-6">
          <div className="font-semibold text-[13px] text-foreground">
            Don&apos;t speak 402 yet?
          </div>
          <p className="m-0 text-[12.5px] text-fg-muted leading-relaxed">
            Hand this to your coding agent — it reads the seller guide, adds
            x402 to your API, and lists it end to end:
          </p>
          <div className="flex items-start gap-2">
            <p
              className="m-0 flex-1 rounded-md border px-3 py-2 font-mono text-[11px] text-fg-subtle leading-[1.55]"
              style={{ borderColor: "var(--ag-border)" }}
            >
              {AGENT_PROMPT}
            </p>
            <CopyButton label="Copy prompt" text={AGENT_PROMPT} />
          </div>
          <p className="m-0 text-[12px] text-fg-subtle leading-relaxed">
            Prefer to read it yourself:{" "}
            <a
              className="font-medium"
              href="https://developers.t2000.ai/sell-your-api"
              rel="noreferrer"
              style={{ color: "var(--ag-accent)" }}
              target="_blank"
            >
              seller guide
            </a>{" "}
            · machine twin at{" "}
            <a
              className="font-medium"
              href="https://mpp.t2000.ai/sellers.md"
              rel="noreferrer"
              style={{ color: "var(--ag-accent)" }}
              target="_blank"
            >
              mpp.t2000.ai/sellers.md
            </a>{" "}
            · from a terminal:{" "}
            <span className="font-mono text-fg-muted">
              t2 check &lt;url&gt; --list
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
