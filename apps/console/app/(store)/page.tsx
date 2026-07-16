import { getUsernamesByIds } from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import { categoryLabel } from "@/lib/categories";
import { fetchRetry } from "@/lib/fetch-retry";
import {
  fetchGatewayServices,
  findServiceByWallet,
  priceFloor,
} from "@/lib/gateway-services";

// agents.t2000.ai — the directory IS the homepage (founder decision
// 2026-07-16). Card grid (the old store presentation), with the gateway
// catalog cross-referenced by wallet so selling agents carry a live
// "sells" chip — the catalog stays the SSOT, the card just points at it.
const API_BASE = "https://api.t2000.ai/v1";

type AgentRow = {
  address: string;
  numericId?: number | null;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  mcpEndpoint?: string | null;
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
  const [{ total, agents }, services] = await Promise.all([
    fetchAgents(),
    fetchGatewayServices(),
  ]);
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => {
            const handle = handles.get(a.address);
            const service = findServiceByWallet(services, a.address);
            const floor = service ? priceFloor(service) : null;
            return (
              <Link
                className="ag-card group flex flex-col gap-3 p-5 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30"
                href={`/${a.numericId ?? a.address}`}
                key={a.address}
              >
                <div className="flex items-center gap-3">
                  <AgentAvatar
                    address={a.address}
                    imageUrl={a.imageUrl ?? undefined}
                    name={a.name}
                    size={40}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[15px] text-foreground tracking-[-0.014em]">
                      {a.name}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">
                      {handle ? `${displayHandle(handle)} · ` : ""}#
                      {a.numericId ?? "—"}
                    </div>
                  </div>
                </div>
                <p className="m-0 line-clamp-3 min-h-[3.9em] text-[12.5px] text-fg-muted leading-relaxed">
                  {a.description?.split("\n")[0] ?? "No description yet."}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2 text-[11px]">
                  {service ? (
                    <span
                      className="rounded-md border px-2 py-0.5 font-mono text-foreground"
                      style={{ borderColor: "var(--ag-border)" }}
                    >
                      sells · {service.endpoints.length}{" "}
                      {service.endpoints.length === 1
                        ? "endpoint"
                        : "endpoints"}
                      {floor ? ` · from ${floor}` : ""}
                    </span>
                  ) : a.mcpEndpoint ? (
                    // Uncataloged seller — the on-chain flagship endpoint.
                    <span
                      className="rounded-md border px-2 py-0.5 font-mono text-foreground"
                      style={{ borderColor: "var(--ag-border)" }}
                    >
                      sells · paid endpoint
                    </span>
                  ) : (
                    a.category && (
                      <span
                        className="rounded-md border px-2 py-0.5 text-fg-muted"
                        style={{ borderColor: "var(--ag-border)" }}
                      >
                        {categoryLabel(a.category)}
                      </span>
                    )
                  )}
                  <span className="ml-auto text-fg-subtle transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        {agents.length === 0 && (
          <div className="ag-card px-4 py-8 text-center text-fg-subtle text-sm">
            Directory temporarily unavailable.
          </div>
        )}

        <a
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-3 text-[12.5px] text-muted-foreground no-underline transition-colors hover:text-foreground"
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
