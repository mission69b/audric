import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import {
  CAMPAIGN_MENTION,
  CAMPAIGNS,
  type Campaign,
  intentUrl,
  paidOutUsd,
} from "@/lib/campaigns";

// Campaigns (§II.16) — curated growth bounties, t2000-posted only. Static
// page from the code-reviewed campaign list; submissions are X posts; review
// is manual; every payout is an on-chain USDC send whose tx lands back in the
// list (the ticker derives from receipts, not self-reports).
export const metadata: Metadata = {
  title: "Campaigns — earn USDC on the agent rail",
  description:
    "Curated bounties from t2000: make your first sale, verify a confidential receipt, hire an agent from your agent. Paid in USDC on Sui, receipts on-chain.",
};

const SUISCAN = "https://suiscan.xyz/mainnet";

function statusBadge(c: Campaign) {
  if (c.status === "live") {
    return (
      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">
        live
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
      {c.status}
    </span>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  const paid = paidOutUsd(c);
  const template = c.postTemplate
    .replaceAll("{mention}", CAMPAIGN_MENTION)
    .replaceAll("{hashtag}", c.hashtag);

  return (
    <div
      className="rounded-2xl border border-border/50 bg-card/40 p-5"
      id={c.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-medium text-foreground">{c.title}</h2>
          {statusBadge(c)}
        </div>
        <div className="font-semibold text-foreground text-lg tracking-tight">
          ${c.rewardUsd}
          <span className="ml-1 font-normal text-muted-foreground/60 text-xs">
            USDC / accepted
          </span>
        </div>
      </div>

      <p className="mt-1.5 max-w-2xl text-muted-foreground text-sm">
        {c.tagline}
      </p>

      {/* Budget ticker — derives from the payout receipts below, never a
          self-reported number. */}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-border/50">
          <div
            className="h-full rounded-full bg-emerald-500/70"
            style={{
              width: `${Math.min((paid / c.budgetUsd) * 100, 100)}%`,
            }}
          />
        </div>
        <span className="text-muted-foreground/70 text-xs">
          ${paid.toFixed(0)} paid of ${c.budgetUsd} budget
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            What to do
          </div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-muted-foreground text-xs leading-relaxed marker:text-muted-foreground/50">
            {c.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Proof
          </div>
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            {c.proof}
          </p>
          <p className="mt-2 text-muted-foreground/60 text-xs">
            Include your Sui address in the post (or its replies) so we know
            where to pay.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-border/40 border-t pt-4">
        <a
          className="rounded-full bg-primary px-4 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
          href={intentUrl(c)}
          rel="noreferrer"
          target="_blank"
        >
          Post your proof on X → {c.hashtag}
        </a>
        <CopyButton label="Copy the post template" text={template} />
      </div>

      {c.payouts.length > 0 && (
        <div className="mt-4">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Payouts
          </div>
          <div className="mt-2 space-y-1">
            {c.payouts.map((p) => (
              <div
                className="flex items-center gap-3 text-muted-foreground/70 text-xs"
                key={p.tx}
              >
                <span className="text-emerald-500">✓</span>
                <span>${p.amountUsd}</span>
                <span>{p.at}</span>
                <a
                  className="font-mono underline underline-offset-4 hover:text-foreground"
                  href={`${SUISCAN}/tx/${p.tx}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  tx ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const totalBudget = CAMPAIGNS.reduce((s, c) => s + c.budgetUsd, 0);
  const totalPaid = CAMPAIGNS.reduce((s, c) => s + paidOutUsd(c), 0);

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Agents
      </Link>

      <h1 className="mt-6 font-semibold text-3xl text-foreground tracking-tight">
        Campaigns
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Do something real on the rail, post the proof, get paid in USDC on Sui.
        Bounties are posted only by t2000 — reviewed by hand, paid out
        gaslessly, every payout an on-chain receipt.
      </p>
      <p className="mt-2 text-muted-foreground/60 text-xs">
        ${totalPaid.toFixed(0)} paid of ${totalBudget} total budget across{" "}
        {CAMPAIGNS.length} campaigns.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {CAMPAIGNS.map((c) => (
          <CampaignCard c={c} key={c.id} />
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border/50 bg-card/40 p-5 text-muted-foreground/70 text-xs leading-relaxed">
        <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          The rules
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-4 marker:text-muted-foreground/40">
          <li>
            One reward per person/wallet per campaign unless a campaign says
            otherwise.
          </li>
          <li>
            Submissions are reviewed by hand, roughly weekly. Wash trades, sybil
            wallets, and junk listings disqualify — our review is final.
          </li>
          <li>
            Payouts are gasless USDC sends on Sui to the address in your post.
            Each payout's tx is published on this page — the numbers above
            derive from those receipts.
          </li>
          <li>
            A campaign pauses when its budget is spent. Budgets are caps, not
            obligations.
          </li>
        </ul>
      </div>
    </>
  );
}
