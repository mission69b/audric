import { getAgentProfile, listAgentsForOwner } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Section } from "@/components/section";

// /manage/earnings (t2000-design/agents ManageConsole §Earnings) — what your
// agents have actually been paid. Every number derives from on-chain
// settlement receipts (the public agent profiles' reputation object); the
// recent list links each row to its Sui transaction.

export const metadata: Metadata = { title: "Earnings" };

const API_BASE = "https://api.t2000.ai/v1";
const SUISCAN = "https://suiscan.xyz/mainnet";

type Reputation = {
  sales: number;
  volumeUsd: number;
  buyers: number;
  refunds?: number;
  deliveredRate?: number | null;
  lastSaleAt: string | null;
  recent?: {
    at: string;
    buyer: string;
    amountUsd: number;
    delivered: boolean;
    tx?: string;
  }[];
};

type AgentEarnings = {
  address: string;
  name: string;
  numericId: number | null;
  rep: Reputation | null;
};

async function fetchReputation(address: string): Promise<Reputation | null> {
  try {
    const res = await fetch(`${API_BASE}/agents/${address}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { reputation?: Reputation };
    return data.reputation ?? null;
  } catch {
    return null;
  }
}

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

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

  const [{ owned }, selfAgent] = await Promise.all([
    listAgentsForOwner(session.user.id),
    getAgentProfile(session.user.id),
  ]);
  const all = [
    ...(selfAgent ? [selfAgent] : []),
    ...owned.filter((a) => a.address !== selfAgent?.address),
  ];

  const reps = await Promise.all(all.map((a) => fetchReputation(a.address)));
  const rows: AgentEarnings[] = all.map((a, i) => ({
    address: a.address,
    name: a.name,
    numericId: a.numericId ?? null,
    rep: reps[i],
  }));

  const totalEarned = rows.reduce((s, r) => s + (r.rep?.volumeUsd ?? 0), 0);
  const totalSales = rows.reduce((s, r) => s + (r.rep?.sales ?? 0), 0);
  const selling = rows.filter((r) => (r.rep?.sales ?? 0) > 0).length;

  // Merge every agent's recent settlements into one feed, newest first.
  const recent = rows
    .flatMap((r) =>
      (r.rep?.recent ?? []).map((s) => ({ ...s, agent: r.name }))
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <Section
        description="Settled USDC across your agents — every number derives from on-chain settlement receipts, and every row links to its Sui transaction."
        title="Earnings"
      >
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border/50">
          {(
            [
              ["Settled", `$${totalEarned.toFixed(2)}`],
              ["Sales", String(totalSales)],
              ["Agents selling", `${selling} of ${rows.length}`],
            ] as const
          ).map(([k, v], i) => (
            <div
              className={`px-4 py-3.5 ${i > 0 ? "border-border/50 border-l" : ""}`}
              key={k}
            >
              <div className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-[0.08em]">
                {k}
              </div>
              <div className="mt-1 font-semibold text-[20px] text-foreground tabular-nums tracking-tight">
                {v}
              </div>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 text-muted-foreground text-sm">
            No agents yet — register one from{" "}
            <Link className="underline underline-offset-4" href="/manage/agents">
              My agents
            </Link>{" "}
            and list a service to start earning.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
            {rows.map((r) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                key={r.address}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      className="font-medium text-foreground text-sm hover:underline"
                      href={`https://agents.t2000.ai/${r.address}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {r.name}
                    </a>
                    {r.numericId != null && (
                      <span className="font-mono text-muted-foreground/60 text-xs">
                        #{r.numericId}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-muted-foreground/50 text-xs">
                    {short(r.address)}
                  </div>
                </div>
                <div className="flex items-center gap-5 text-sm">
                  <span className="text-muted-foreground/70 text-xs">
                    {r.rep?.sales ?? 0} sold · {r.rep?.buyers ?? 0} buyer
                    {(r.rep?.buyers ?? 0) === 1 ? "" : "s"}
                    {typeof r.rep?.deliveredRate === "number" && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-emerald-500">
                          {Math.round(r.rep.deliveredRate * 100)}% delivered
                        </span>
                      </>
                    )}
                  </span>
                  <span className="font-medium text-foreground tabular-nums">
                    ${(r.rep?.volumeUsd ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {recent.length > 0 && (
        <Section
          description="The last settlements across your agents, straight from the ledger."
          title="Recent settlements"
        >
          <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
            {recent.map((s) => {
              const row = (
                <>
                  <div className="flex min-w-0 items-center gap-3 text-sm">
                    <span
                      className={
                        s.delivered ? "text-emerald-500" : "text-destructive"
                      }
                    >
                      {s.delivered ? "✓" : "↩"}
                    </span>
                    <span className="truncate text-muted-foreground">
                      <span className="text-foreground">{s.agent}</span>{" "}
                      {s.delivered ? "delivered to" : "auto-refunded"}{" "}
                      <span className="font-mono text-xs">{s.buyer}</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    <span className="font-medium text-foreground tabular-nums">
                      ${s.amountUsd.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground/60 text-xs">
                      {fmtDate(s.at)}
                    </span>
                    {s.tx && (
                      <span className="font-mono text-muted-foreground/60 text-xs underline underline-offset-4">
                        tx ↗
                      </span>
                    )}
                  </div>
                </>
              );
              const key = `${s.at}-${s.buyer}-${s.agent}`;
              return s.tx ? (
                <a
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
                  href={`${SUISCAN}/tx/${s.tx}`}
                  key={key}
                  rel="noreferrer"
                  target="_blank"
                >
                  {row}
                </a>
              ) : (
                <div
                  className="flex items-center justify-between gap-4 px-4 py-3"
                  key={key}
                >
                  {row}
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-muted-foreground/60 text-xs">
            $ t2 agent earnings — the same numbers from the CLI.
          </p>
        </Section>
      )}
    </div>
  );
}
