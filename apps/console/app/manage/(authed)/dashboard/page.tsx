import {
  getAgentProfile,
  getCreditBalanceMicros,
  listAgentsForOwner,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelHead } from "@/components/panel-head";
import { RegisterSelfCard } from "@/components/register-self-card";
import { fetchWalletUsdc } from "@/lib/wallet-usdc";

// Overview — three live stat cards (RPC / accounts) + the two-balance money
// rule stated once. Commerce-era earnings/sales feeds removed (S.701).

function StatCard({
  label,
  value,
  unit,
  href,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  href: string;
  color?: string;
}) {
  return (
    <Link
      className="ag-card ag-card--hover block p-[18px] no-underline"
      href={href}
    >
      <div className="font-mono text-[10.5px] text-fg-subtle uppercase tracking-[0.07em]">
        {label}
      </div>
      <div
        className="mt-2 font-semibold text-[27px] tabular-nums tracking-[-0.03em]"
        style={{ color: color ?? "var(--fg)" }}
      >
        {value}
      </div>
      <div className="mt-[3px] font-mono text-[11px] text-fg-subtle">
        {unit}
      </div>
    </Link>
  );
}

export default async function OverviewPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const [balanceMicros, selfAgent, walletUsdc, ownership] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    getAgentProfile(session.user.id),
    fetchWalletUsdc(session.user.id),
    listAgentsForOwner(session.user.id),
  ]);
  const credit = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);
  const agentCount = ownership.owned.length + (selfAgent ? 1 : 0);

  return (
    <>
      <PanelHead
        sub="Your money and your agents, at a glance."
        title="Overview"
      />

      {/* Consent-first self-registration — visible until the Passport has an
          Agent ID (§II.15b.1: explicit, never silent). */}
      {!selfAgent && (
        <div className="mb-3.5">
          <RegisterSelfCard />
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <StatCard
          color="var(--ag-verify)"
          href="/manage/billing"
          label="USDC balance"
          unit="wallet"
          value={walletUsdc === null ? "—" : `$${walletUsdc.toFixed(2)}`}
        />
        <StatCard
          color="var(--ag-accent)"
          href="/manage/billing"
          label="Credit"
          unit="Private API + Audric"
          value={`$${credit}`}
        />
        <StatCard
          href="/manage/agents"
          label="My agents"
          unit="registered"
          value={String(agentCount)}
        />
      </div>

      {/* The money rule, stated once. */}
      <div className="ag-card flex flex-wrap items-center gap-x-[22px] gap-y-2 px-[18px] py-[13px]">
        <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
          <span
            className="size-[7px] rounded-full"
            style={{ background: "var(--ag-verify)" }}
          />
          <b className="text-foreground">USDC</b> → on-chain agent payments
          (x402, pay-per-call APIs).
        </span>
        <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
          <span
            className="size-[7px] rounded-full"
            style={{ background: "var(--ag-accent)" }}
          />
          <b className="text-foreground">Credit</b> → model calls on the Private
          API and in Audric chat — one shared balance.
        </span>
      </div>
    </>
  );
}
