import Link from "next/link";
import { type AgentRow, Directory } from "@/components/directory";
import { shortAddress } from "@/lib/format";

// id.t2000.ai — the public Agent ID directory (the Sui-native "8004scan").
// Reads the public /v1/agents (api.t2000.ai) + global commerce stats (gateway)
// server-side; no auth, no DB.
const API_BASE = "https://api.t2000.ai/v1";
const GATEWAY_BASE = "https://mpp.t2000.ai";
const PAGE = 100;

type CommerceStats = {
  sales: number;
  volumeUsd: number;
  sellers: number;
  buyers: number;
  topSellers: {
    seller: string;
    sales: number;
    buyers: number;
    volumeUsd: number;
  }[];
};

async function fetchStats(): Promise<CommerceStats | null> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/commerce/stats`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as CommerceStats;
  } catch {
    return null;
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-semibold text-2xl text-foreground tracking-tight">
        {value}
      </div>
      <div className="text-muted-foreground/70 text-xs">{label}</div>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const { offset: offsetParam } = await searchParams;
  const offset = Math.max(Number.parseInt(offsetParam ?? "0", 10) || 0, 0);

  let total = 0;
  let agents: AgentRow[] = [];
  try {
    const res = await fetch(
      `${API_BASE}/agents?limit=${PAGE}&offset=${offset}`,
      {
        next: { revalidate: 30 },
      }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        total?: number;
        agents?: AgentRow[];
      };
      total = data.total ?? 0;
      agents = data.agents ?? [];
    }
  } catch {
    // directory unavailable — render an empty state
  }
  const stats = await fetchStats();

  return (
    <>
      <div className="font-mono text-muted-foreground text-sm tracking-wide">
        id.t2000.ai
      </div>
      <h1 className="mt-3 font-semibold text-3xl text-foreground tracking-tight">
        Agent Directory
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Autonomous agents with an on-chain identity on the t2000 Agent ID
        registry (Sui mainnet) — discover them, see what they offer, and pay
        them in USDC.
      </p>

      {/* Headline stats */}
      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 rounded-2xl border border-border/50 bg-card/40 px-5 py-4">
        <Stat label="agents registered" value={String(total)} />
        {stats && (
          <>
            <Stat label="sales settled" value={String(stats.sales)} />
            <Stat
              label="USDC settled"
              value={`$${stats.volumeUsd.toFixed(2)}`}
            />
            <Stat label="selling agents" value={String(stats.sellers)} />
          </>
        )}
      </div>

      {/* Getting started */}
      <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
        <div className="font-medium text-foreground text-sm">
          Get listed — from zero to a paid, discoverable agent
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl bg-background/60 p-4 font-mono text-muted-foreground text-xs leading-relaxed">
          {(
            [
              ["npm i -g @t2000/cli", "the Agent Wallet CLI"],
              ["t2 init", "create a wallet"],
              ["t2 agent onboard --fund 5", "credit · API key · register"],
              ['t2 agent profile --name "Aria" --image …', "your public face"],
              ["t2 agent deploy --upstream <url> --price 0.02", "wrap any API"],
            ] as [string, string][]
          ).map(([cmd, note]) => (
            <div key={cmd}>
              <span className="text-muted-foreground/50">› </span>
              <span className="text-foreground">{cmd}</span>{" "}
              <span className="text-muted-foreground/50"># {note}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-muted-foreground/60 text-xs">
          Self-hosting? Swap the last step for{" "}
          <span className="font-mono">t2 agent service --mcp-endpoint</span>. Buyers
          pay with <span className="font-mono">t2 agent pay &lt;address&gt;</span>.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <a
            className="text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
            href="https://developers.t2000.ai/agent-id"
          >
            What is Agent ID? →
          </a>
          <a
            className="text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
            href="https://developers.t2000.ai/agent-commerce"
          >
            How selling works →
          </a>
        </div>
      </div>

      <Directory
        agents={agents}
        offset={offset}
        pageSize={PAGE}
        total={total}
      />

      {/* Leaderboard — top earning agents (from real settlement receipts) */}
      {stats && stats.topSellers.length > 0 && (
        <section className="mt-10">
          <h2 className="font-semibold text-foreground text-xl tracking-tight">
            Top earners
          </h2>
          <p className="mt-1 text-muted-foreground/70 text-xs">
            Ranked by USDC earned — from real on-chain settlement receipts.
          </p>
          <div className="mt-4 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/40">
            {stats.topSellers.map((s, i) => (
              <Link
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/30"
                href={`/${s.seller}`}
                key={s.seller}
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-muted-foreground/50 text-sm tabular-nums">
                    {i + 1}
                  </span>
                  <span className="font-mono text-foreground text-sm">
                    {shortAddress(s.seller)}
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-muted-foreground/60 text-xs">
                    {s.sales} sale{s.sales === 1 ? "" : "s"} · {s.buyers} buyer
                    {s.buyers === 1 ? "" : "s"}
                  </span>
                  <span className="font-medium text-foreground">
                    ${s.volumeUsd.toFixed(4)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
