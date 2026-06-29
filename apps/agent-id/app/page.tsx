import { type AgentRow, Directory } from "@/components/directory";

// id.t2000.ai — the public Agent ID directory (the Sui-native "8004scan").
// Reads the public /v1/agents (api.t2000.ai) server-side; no auth, no DB.
const API_BASE = "https://api.t2000.ai/v1";
const PAGE = 100;

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
        registry (Sui mainnet). {total} registered.
      </p>

      <Directory
        agents={agents}
        offset={offset}
        pageSize={PAGE}
        total={total}
      />
    </>
  );
}
