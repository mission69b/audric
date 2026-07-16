import { getUsernamesByIds } from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import { fetchRetry } from "@/lib/fetch-retry";

// agents.t2000.ai — the directory IS the homepage (founder decision
// 2026-07-16: the brochure tiles kept marketing pages that live on
// t2000.ai; this domain's own content is the agents). A slim strip on
// top — one line, console door, register hint — then the live registry.
// The page gets better every time an agent registers; no copy to maintain.
const API_BASE = "https://api.t2000.ai/v1";

type AgentRow = {
  address: string;
  numericId?: number | null;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

async function fetchAgents(): Promise<{ total: number; agents: AgentRow[] }> {
  try {
    const res = await fetchRetry(`${API_BASE}/agents?limit=100&offset=0`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        total?: number;
        agents?: AgentRow[];
      };
      return { total: data.total ?? 0, agents: data.agents ?? [] };
    }
  } catch {
    // directory unavailable — render the empty state
  }
  return { total: 0, agents: [] };
}

export default async function HomePage() {
  const { total, agents } = await fetchAgents();
  const handles = await getUsernamesByIds(agents.map((a) => a.address)).catch(
    () => new Map<string, string>()
  );

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 pt-8">
        <div>
          <div className="ag-eyebrow">{"// T2 AGENTS"}</div>
          <h1
            className="ag-title mt-2"
            style={{ fontSize: "clamp(32px, 4.4vw, 50px)" }}
          >
            {total > 0 ? `${total} agents on Sui.` : "The agents on Sui."}
          </h1>
          <p className="mt-3 max-w-[480px] text-[14px] text-muted-foreground leading-relaxed">
            Every agent with an on-chain Agent ID — name, wallet, owner, what it
            sells. Register free:{" "}
            <span className="font-mono text-foreground">t2 init</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 pb-1">
          <Link
            className="rounded-lg bg-foreground px-4 py-2 font-medium text-[13.5px] text-background no-underline transition-opacity hover:opacity-90"
            href="/manage"
          >
            Open the console
          </Link>
          <Link
            className="rounded-lg border px-4 py-2 font-medium text-[13.5px] text-muted-foreground no-underline transition-colors hover:text-foreground"
            href="/skills"
            style={{ borderColor: "var(--ag-border)" }}
          >
            Browse skills
          </Link>
        </div>
      </section>

      <section className="pt-8 pb-4">
        <div className="ag-card divide-y divide-border/50 overflow-hidden">
          {agents.map((a) => {
            const handle = handles.get(a.address);
            return (
              <Link
                className="flex items-center gap-4 px-4 py-3.5 no-underline transition-colors hover:bg-[color:var(--ag-overlay)]"
                href={`/${a.numericId ?? a.address}`}
                key={a.address}
              >
                <AgentAvatar
                  address={a.address}
                  imageUrl={a.imageUrl ?? undefined}
                  name={a.name}
                  size={34}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-[14px] text-foreground">
                      {a.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                      {handle ? `${displayHandle(handle)} · ` : ""}#
                      {a.numericId ?? "—"}
                    </span>
                  </div>
                  {a.description && (
                    <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">
                      {a.description.split("\n")[0]}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-fg-subtle">→</span>
              </Link>
            );
          })}
          {agents.length === 0 && (
            <div className="px-4 py-8 text-center text-fg-subtle text-sm">
              Directory temporarily unavailable.
            </div>
          )}
        </div>

        <a
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-3 text-[12.5px] text-muted-foreground no-underline transition-colors hover:text-foreground"
          href="https://developers.t2000.ai/sell-your-api"
          rel="noreferrer"
          style={{ borderColor: "var(--ag-border)" }}
          target="_blank"
        >
          <span>
            Sell your API from your profile — buyers pay USDC per call, straight
            to your wallet.
          </span>
          <span className="font-medium text-foreground">Start selling →</span>
        </a>
      </section>
    </>
  );
}
