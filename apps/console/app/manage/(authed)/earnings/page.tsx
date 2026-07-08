import { getCurrentUser } from "@audric/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { PanelHead } from "@/components/panel-head";
import { fetchMyEarnings } from "@/lib/earnings";

// /manage/earnings (t2000-design/agents ManageConsole §EarningsPanel):
// stat cards → By agent → Recent settlements. Every number derives from
// on-chain settlement receipts; every row links to its Sui transaction.

export const metadata: Metadata = { title: "Earnings" };

const SUISCAN = "https://suiscan.xyz/mainnet";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function EarningsPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const { rows, totalEarned, totalSales, recent } = await fetchMyEarnings(
    session.user.id
  );
  const selling = rows.filter((r) => (r.rep?.sales ?? 0) > 0).length;

  return (
    <>
      <PanelHead
        action={
          <a
            className="ag-btn ag-btn--ghost ag-btn--sm"
            href="https://audric.ai/?q=What%27s%20my%20balance%3F%20Help%20me%20send%20USDC%20to%20another%20address."
            rel="noreferrer"
            target="_blank"
          >
            Send via Audric ↗
          </a>
        }
        sub="Everything your agents earned — settled to your USDC balance, receipt by receipt."
        title="Earnings"
      />

      <div className="mb-[22px] grid gap-3.5 sm:grid-cols-3">
        {(
          [
            [
              "Total earned",
              `$${totalEarned.toFixed(2)}`,
              "all time",
              "var(--ag-verify)",
            ],
            ["Sales", String(totalSales), "settled", null],
            [
              "Agents selling",
              `${selling} of ${rows.length}`,
              "with receipts",
              null,
            ],
          ] as const
        ).map(([k, v, u, c]) => (
          <div className="ag-card p-[18px]" key={k}>
            <div className="font-mono text-[10.5px] text-fg-subtle uppercase tracking-[0.07em]">
              {k}
            </div>
            <div
              className="mt-2 font-semibold text-[27px] tabular-nums tracking-[-0.03em]"
              style={{ color: c ?? "var(--fg)" }}
            >
              {v}
            </div>
            <div className="mt-[3px] font-mono text-[11px] text-fg-subtle">
              {u}
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="m-0 text-fg-muted text-sm">
          No agents yet — register one from{" "}
          <Link className="text-foreground" href="/manage/agents">
            My agents
          </Link>{" "}
          and list a service to start earning.
        </p>
      ) : (
        <div className="ag-card mb-4 overflow-hidden p-0">
          <div
            className="border-b px-5 py-[13px] font-semibold text-[14px] text-foreground"
            style={{ borderColor: "var(--ag-border)" }}
          >
            By agent
          </div>
          {rows.map((r, i) => (
            <Link
              className="flex items-center gap-3.5 px-5 py-3.5 no-underline transition-colors hover:bg-[color:var(--ag-overlay)]"
              href={`/${r.address}`}
              key={r.address}
              style={
                i ? { borderTop: "1px solid var(--ag-border)" } : undefined
              }
            >
              <AgentAvatar
                address={r.address}
                imageUrl={r.imageUrl}
                name={r.name}
                size={30}
              />
              <span className="flex-1 font-medium text-[14px] text-foreground">
                {r.name}
                {r.numericId != null && (
                  <span className="ml-2 font-mono font-normal text-fg-subtle text-xs">
                    #{r.numericId}
                  </span>
                )}
              </span>
              <span className="w-24 text-right font-mono text-[12px] text-fg-muted">
                {r.rep?.sales ?? 0} sold
              </span>
              <span
                className="w-[70px] text-right font-mono text-[13.5px] tabular-nums"
                style={{ color: "var(--ag-verify)" }}
              >
                ${(r.rep?.volumeUsd ?? 0).toFixed(2)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="ag-card overflow-hidden p-0">
            <div
              className="border-b px-5 py-[13px] font-semibold text-[14px] text-foreground"
              style={{ borderColor: "var(--ag-border)" }}
            >
              Recent settlements
            </div>
            {recent.map((s, i) => {
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
                    {s.delivered ? (
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="14"
                        viewBox="0 0 16 16"
                        width="14"
                      >
                        <path
                          d="M3.5 8.5l3 3 6-7"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                      </svg>
                    ) : (
                      "↩"
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-foreground">
                      {s.agent}{" "}
                      <span className="text-fg-subtle">
                        {s.delivered ? "· paid by" : "· auto-refunded"}{" "}
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
                    {s.delivered ? "+" : ""}${s.amountUsd.toFixed(2)} USDC
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-[11.5px] text-fg-subtle">
                    {fmtDate(s.at)}
                  </span>
                </>
              );
              const key = `${s.at}-${s.buyer}-${s.agent}`;
              const cls = "flex items-center gap-3.5 px-5 py-[13px]";
              const style = i
                ? { borderTop: "1px solid var(--ag-border)" }
                : undefined;
              return s.tx ? (
                <a
                  className={`${cls} no-underline transition-colors hover:bg-[color:var(--ag-overlay)]`}
                  href={`${SUISCAN}/tx/${s.tx}`}
                  key={key}
                  rel="noreferrer"
                  style={style}
                  target="_blank"
                >
                  {inner}
                </a>
              ) : (
                <div className={cls} key={key} style={style}>
                  {inner}
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-fg-subtle text-xs">
            $ t2 agent earnings — the same numbers from the CLI.
          </p>
        </>
      )}
    </>
  );
}
