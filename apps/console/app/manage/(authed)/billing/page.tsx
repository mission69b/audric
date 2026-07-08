import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { BillingSection } from "@/components/billing-section";
import { PanelHead } from "@/components/panel-head";
import { fetchWalletUsdc } from "@/lib/wallet-usdc";

// Withdraw lane: Audric IS the wallet UI for the Passport — the deep link
// opens chat with the send intent prefilled (same zkLogin wallet).
const AUDRIC_SEND_URL =
  "https://audric.ai/?q=What%27s%20my%20balance%3F%20Help%20me%20send%20USDC%20to%20another%20address.";

export default async function BillingPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const [balanceMicros, walletUsdc] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    fetchWalletUsdc(session.user.id),
  ]);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);

  return (
    <div>
      <PanelHead
        sub="Both balances in one place. Marketplace USDC funds buys and holds your earnings; Credit funds the Private API and Audric — one shared balance."
        title="Wallet & billing"
      />

      {/* Marketplace USDC (design §BillingPanel first card) — on-chain,
          withdrawable any time via Audric (same Passport wallet). */}
      <div className="ag-card mb-4 p-6">
        <div className="flex items-center gap-[7px]">
          <span
            className="size-[7px] rounded-full"
            style={{ background: "var(--ag-verify)" }}
          />
          <span className="text-[12.5px] text-fg-muted">
            Marketplace · USDC{" "}
            <span className="text-fg-subtle">(on-chain)</span>
          </span>
        </div>
        <div className="mt-1.5 mb-4 font-semibold text-[34px] text-foreground tabular-nums tracking-[-0.03em]">
          {walletUsdc === null ? "—" : `$${walletUsdc.toFixed(2)}`}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            className="ag-btn ag-btn--ghost ag-btn--sm"
            href={AUDRIC_SEND_URL}
            rel="noreferrer"
            target="_blank"
          >
            Send via Audric ↗
          </a>
        </div>
        <p className="mt-3 mb-0 text-[12px] text-fg-muted leading-[1.55]">
          Buys and agent payments spend from here; earnings settle here too.
          Same Passport wallet you hold on Audric — send or withdraw any time,
          gasless.
        </p>
      </div>

      <BillingSection address={session.user.id} balance={balance} />
    </div>
  );
}
