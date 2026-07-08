import { getAgentProfile, getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelHead } from "@/components/panel-head";
import { RegisterSelfCard } from "@/components/register-self-card";
import { fetchMyEarnings } from "@/lib/earnings";
import { fetchWalletUsdc } from "@/lib/wallet-usdc";

// Overview (t2000-design/agents ManageConsole §OverviewPanel): four stat
// cards → their panels, the two-balance money rule stated once, then the
// recent-settlements feed. Every number is live (RPC / accounts / receipts).

const SUISCAN = "https://suiscan.xyz/mainnet";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

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
  const [balanceMicros, selfAgent, walletUsdc, earnings] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    getAgentProfile(session.user.id),
    fetchWalletUsdc(session.user.id),
    fetchMyEarnings(session.user.id),
  ]);
  const credit = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);

  return (
    <>
      <PanelHead
        sub="Your money, your listings, and what needs attention."
        title="Overview"
      />

      {/* Consent-first self-registration — visible until the Passport has an
          Agent ID (§II.15b.1: explicit, never silent). */}
      {!selfAgent && (
        <div className="mb-3.5">
          <RegisterSelfCard />
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          color="var(--ag-verify)"
          href="/manage/billing"
          label="USDC balance"
          unit="marketplace"
          value={walletUsdc === null ? "—" : `$${walletUsdc.toFixed(2)}`}
        />
        <StatCard
          href="/manage/earnings"
          label="Earned"
          unit={`${earnings.totalBuyers} buyer${earnings.totalBuyers === 1 ? "" : "s"}`}
          value={`$${earnings.totalEarned.toFixed(2)}`}
        />
        <StatCard
          href="/manage/agents"
          label="Active listings"
          unit="live"
          value={String(earnings.activeListings)}
        />
        <StatCard
          color="var(--ag-accent)"
          href="/manage/billing"
          label="Credit"
          unit="Private API + Audric"
          value={`$${credit}`}
        />
      </div>

      {/* The money rule, stated once (design). */}
      <div className="ag-card mb-3.5 flex flex-wrap items-center gap-x-[22px] gap-y-2 px-[18px] py-[13px]">
        <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
          <span
            className="size-[7px] rounded-full"
            style={{ background: "var(--ag-verify)" }}
          />
          <b className="text-foreground">USDC</b> → buy services, agent
          payments, and your earnings.
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

      {/* Recent activity — the last settlements across your agents. */}
      <div className="ag-card overflow-hidden p-0">
        <div
          className="flex items-center justify-between border-b px-5 py-3.5"
          style={{ borderColor: "var(--ag-border)" }}
        >
          <span className="font-semibold text-[14px] text-foreground">
            Recent activity
          </span>
          <Link
            className="font-mono text-[12px] text-fg-subtle no-underline transition-colors hover:text-foreground"
            href="/manage/earnings"
          >
            View all ›
          </Link>
        </div>
        {earnings.recent.length === 0 ? (
          <p className="m-0 px-5 py-4 text-fg-muted text-sm">
            No settlements yet — list a service from{" "}
            <Link className="text-foreground" href="/manage/agents">
              My agents
            </Link>{" "}
            to start earning.
          </p>
        ) : (
          earnings.recent.slice(0, 6).map((s, i) => {
            const inner = (
              <>
                <span
                  className="shrink-0"
                  style={{
                    color: s.delivered
                      ? "var(--ag-verify)"
                      : "var(--fg-subtle)",
                  }}
                >
                  {s.delivered ? "✓" : "↩"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-foreground">
                    {s.agent}{" "}
                    <span className="text-fg-subtle">
                      {s.delivered ? "delivered to" : "auto-refunded"}{" "}
                      <span className="font-mono text-xs">{s.buyer}</span>
                    </span>
                  </div>
                </div>
                <span
                  className="font-mono text-[13px] tabular-nums"
                  style={{
                    color: s.delivered ? "var(--ag-verify)" : "var(--fg)",
                  }}
                >
                  {s.delivered ? "+" : ""}${s.amountUsd.toFixed(2)}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[11.5px] text-fg-subtle">
                  {fmtDate(s.at)}
                </span>
              </>
            );
            const key = `${s.at}-${s.buyer}-${s.agent}`;
            const rowCls = "flex items-center gap-3.5 px-5 py-[13px]";
            const rowStyle = i
              ? { borderTop: "1px solid var(--ag-border)" }
              : undefined;
            return s.tx ? (
              <a
                className={`${rowCls} no-underline transition-colors hover:bg-[color:var(--ag-overlay)]`}
                href={`${SUISCAN}/tx/${s.tx}`}
                key={key}
                rel="noreferrer"
                style={rowStyle}
                target="_blank"
              >
                {inner}
              </a>
            ) : (
              <div className={rowCls} key={key} style={rowStyle}>
                {inner}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
