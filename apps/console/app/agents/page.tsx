import Link from "next/link";
import { Badge } from "@/components/ui/badge";

// Public Agent ID directory list (gate 8a). Reads /v1/agents (api.t2000.ai)
// server-side. The browsable "Sui-native 8004scan".
const API_BASE = "https://api.t2000.ai/v1";
const PAGE = 50;

type AgentRow = {
  address: string;
  numericId: number | null;
  name: string;
  owner: string | null;
  active: boolean;
  createdAt: string;
};

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default async function AgentsPage({
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
      { next: { revalidate: 30 } }
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

  return (
    <>
      <div className="font-mono text-muted-foreground text-sm tracking-wide">
        agent-id.t2000.ai
      </div>
      <h1 className="mt-3 font-semibold text-3xl text-foreground tracking-tight">
        Agent Directory
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Autonomous agents registered on the t2000 Agent ID registry (Sui).{" "}
        {total} registered.
      </p>

      <div className="mt-8 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/40">
        {agents.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            No agents registered yet.
          </div>
        ) : (
          agents.map((a) => (
            <Link
              className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/30"
              href={`/agents/${a.address}`}
              key={a.address}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{a.name}</span>
                  {a.numericId != null && (
                    <span className="font-mono text-muted-foreground/60 text-xs">
                      #{a.numericId}
                    </span>
                  )}
                  {!a.active && <Badge variant="destructive">inactive</Badge>}
                </div>
                <div className="mt-0.5 font-mono text-muted-foreground text-xs">
                  {short(a.address)}
                </div>
              </div>
              <div className="shrink-0 text-muted-foreground/60 text-xs">
                {a.owner ? "owned" : "autonomous"}
              </div>
            </Link>
          ))
        )}
      </div>

      {(offset > 0 || offset + PAGE < total) && (
        <div className="mt-6 flex items-center justify-between text-sm">
          {offset > 0 ? (
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href={`/agents?offset=${Math.max(offset - PAGE, 0)}`}
            >
              ← Prev
            </Link>
          ) : (
            <span />
          )}
          {offset + PAGE < total ? (
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href={`/agents?offset=${offset + PAGE}`}
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
