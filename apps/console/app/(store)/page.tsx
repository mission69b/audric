import { getUsernamesByIds } from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import { categoryLabel } from "@/lib/categories";
import { fetchRetry } from "@/lib/fetch-retry";
import {
  fetchGatewayServices,
  fetchRailPayments,
  fetchRailVolume,
  fetchServiceStats,
  findServiceByWallet,
  type GatewayService,
  priceFloor,
  type ServiceStats,
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

function serviceHref(s: GatewayService): string {
  // Store pages render for every payTo wallet (claimed or not); proxied
  // gateway services have no wallet — link the rail's service page.
  return s.payTo ? `/${s.payTo}` : `https://mpp.t2000.ai/services/${s.id}`;
}

export default async function HomePage() {
  const [{ total, agents }, services, { total: settlements }, days] =
    await Promise.all([
      fetchAgents(),
      fetchGatewayServices(),
      fetchRailPayments(1),
      fetchRailVolume(),
    ]);
  const [handles, statsList] = await Promise.all([
    getUsernamesByIds(agents.map((a) => a.address)).catch(
      () => new Map<string, string>()
    ),
    Promise.all(services.map((s) => fetchServiceStats(s.id))),
  ]);
  const statsById = new Map<string, ServiceStats | null>(
    services.map((s, i) => [s.id, statsList[i]])
  );
  const weekVolume = days.reduce((n, d) => n + d.volume, 0);

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

      {/* Live rail stats — the store keeps no ledger of its own; these are
          the rail's numbers (payments log + catalog). */}
      <section className="pt-7">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Settlements", settlements.toLocaleString()],
            ["Volume · 7d", `$${weekVolume.toFixed(2)}`],
            ["Services live", String(services.length)],
            ["Agents", total.toLocaleString()],
          ].map(([label, value]) => (
            <div className="ag-card px-4 py-3" key={label}>
              <div className="font-semibold text-[20px] text-foreground tracking-[-0.02em]">
                {value}
              </div>
              <div className="mt-0.5 text-[11px] text-fg-subtle uppercase tracking-wide">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What's selling — the rail catalog rendered store-side: every card
          links to the seller's store page (claimed or not), where try-it,
          reputation, and the sales feed live. */}
      {services.length > 0 && (
        <section className="pt-9">
          <div className="ag-eyebrow">{"// WHAT'S SELLING"}</div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2
              className="ag-title"
              style={{ fontSize: "clamp(26px, 3vw, 36px)" }}
            >
              Paid APIs, live on the rail.
            </h2>
            <p className="m-0 max-w-[340px] pb-1 text-fg-subtle text-xs leading-relaxed">
              USDC per call, settled straight to the seller&apos;s wallet — sold
              counts come from the on-chain payment log.
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((s) => {
              const floor = priceFloor(s);
              const stats = statsById.get(s.id);
              const href = serviceHref(s);
              const card = (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="truncate font-semibold text-[15px] text-foreground tracking-[-0.014em]">
                      {s.name}
                    </div>
                    {floor && (
                      <span className="shrink-0 font-mono text-[12px] text-fg-muted">
                        from {floor}
                      </span>
                    )}
                  </div>
                  <p className="m-0 line-clamp-2 min-h-[2.6em] text-[12.5px] text-fg-muted leading-relaxed">
                    {s.description}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className="rounded-md border px-2 py-0.5 font-mono text-foreground"
                      style={{ borderColor: "var(--ag-border)" }}
                    >
                      {s.endpoints.length}{" "}
                      {s.endpoints.length === 1 ? "endpoint" : "endpoints"}
                    </span>
                    {stats && stats.sold > 0 && (
                      <span
                        className="rounded-md border px-2 py-0.5 font-mono text-foreground"
                        style={{ borderColor: "var(--ag-border)" }}
                      >
                        sold · {stats.sold}
                      </span>
                    )}
                    {s.direct && (
                      <span className="rounded-md border border-transparent px-2 py-0.5 text-fg-subtle">
                        direct seller
                      </span>
                    )}
                    <span className="ml-auto text-fg-subtle transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </div>
                </>
              );
              const className =
                "ag-card group flex flex-col gap-3 p-5 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30";
              return href.startsWith("/") ? (
                <Link className={className} href={href} key={s.id}>
                  {card}
                </Link>
              ) : (
                <a
                  className={className}
                  href={href}
                  key={s.id}
                  rel="noreferrer"
                >
                  {card}
                </a>
              );
            })}
          </div>
        </section>
      )}

      <section className="pt-9 pb-4">
        <div className="ag-eyebrow">{"// ALL AGENTS"}</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          href="https://mpp.t2000.ai/sell"
          rel="noreferrer"
          style={{ borderColor: "var(--ag-border)" }}
        >
          <span>
            Sell your API — paste its URL, no account. Buyers pay USDC per call,
            straight to your wallet.
          </span>
          <span className="font-medium text-foreground">Start selling →</span>
        </a>
      </section>
    </>
  );
}
