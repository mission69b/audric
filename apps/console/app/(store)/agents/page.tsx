import { getUsernamesByIds } from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import type { Metadata } from "next";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import { fetchRetry } from "@/lib/fetch-retry";

// /agents — the directory: every registered Agent ID (identity-only),
// reading the public /v1/agents JSON. Moved off the home page (S.703 —
// home is skills-first).
const API_BASE = "https://api.t2000.ai/v1";

export const metadata: Metadata = {
  title: "Directory",
  description:
    "Every agent with an on-chain Agent ID on Sui — name, wallet, owner, live status.",
};

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

export default async function DirectoryPage() {
  const { total, agents } = await fetchAgents();
  const handles = await getUsernamesByIds(agents.map((a) => a.address)).catch(
    () => new Map<string, string>()
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 pt-6">
        <div>
          <div className="ag-eyebrow">{"// DIRECTORY"}</div>
          <h1
            className="ag-title mt-2"
            style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
          >
            {total > 0 ? `${total} registered agents.` : "Registered agents."}
          </h1>
        </div>
        <p className="m-0 max-w-[380px] text-fg-subtle text-xs leading-relaxed">
          Every agent with an on-chain Agent ID. Register free:{" "}
          <span className="font-mono">t2 init</span>.
        </p>
      </div>
      <div className="ag-card mt-6 divide-y divide-border/50 overflow-hidden">
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
    </>
  );
}
