import { getAgentNamesByAddresses, listAgentTokens } from "@audric/accounts";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import { formatDate, shortAddress } from "@/lib/format";

// The Capital Market tab (SPEC_ACP_SUI §6 item 3): agent tokens, sorted New
// or Top-by-fees-to-agent. Every number is event-derived (indexer over the
// on-chain registry + lock events) — no fake numbers (§8). "Trending" needs
// indexed swap volume we don't have yet, so it does NOT ship a made-up
// proxy; the two honest sorts do.
export const dynamic = "force-dynamic";

function floorSui(raw: number): string {
  return (Math.floor((raw / 1e9) * 10_000) / 10_000).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}

export default async function CapitalPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortParam } = await searchParams;
  const sort = sortParam === "fees" ? "fees" : "new";
  const tokens = await listAgentTokens({ sort, limit: 50 });
  const names = await getAgentNamesByAddresses(tokens.map((t) => t.agent));

  return (
    <main className="mx-auto w-full max-w-[1000px] px-6 py-10">
      <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">
        Capital Market
      </h1>
      <p className="mt-1 mb-5 text-[13px] text-fg-subtle">
        Agent-bound tokens: fixed supply, LP locked 10 years, pool fees to the
        agent&apos;s wallet — the agent funds its own work.
      </p>

      <div className="mb-4 flex gap-2">
        <Link
          className={`ag-btn ag-btn--sm ${sort === "new" ? "ag-btn--primary" : "ag-btn--ghost"}`}
          href="/capital"
        >
          New
        </Link>
        <Link
          className={`ag-btn ag-btn--sm ${sort === "fees" ? "ag-btn--primary" : "ag-btn--ghost"}`}
          href="/capital?sort=fees"
        >
          Top by fees to agent
        </Link>
      </div>

      {tokens.length === 0 ? (
        <div className="ag-card p-8 text-center text-[13px] text-fg-subtle">
          No agent tokens yet. Tokenize yours from the Create Agent form or your{" "}
          <Link href="/manage">manage page</Link>.
        </div>
      ) : (
        <div className="ag-card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Token</th>
                <th className="px-4 py-2.5 font-medium">Launched</th>
                <th className="px-4 py-2.5 font-medium text-right">
                  Fees to agent (SUI)
                </th>
                <th className="px-4 py-2.5 font-medium text-right">Claims</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr
                  className="border-t"
                  key={t.agent}
                  style={{ borderColor: "var(--ag-border)" }}
                >
                  <td className="px-4 py-2.5">
                    <Link
                      className="flex items-center gap-2 text-foreground no-underline"
                      href={`/${t.agent}`}
                    >
                      <AgentAvatar address={t.agent} size={22} />
                      {names.get(t.agent)?.name ?? shortAddress(t.agent)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-mono">${t.symbol}</td>
                  <td className="px-4 py-2.5 text-fg-subtle">
                    {t.finalizedAtMs
                      ? formatDate(new Date(t.finalizedAtMs).toISOString())
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {floorSui(t.feesClaimedSuiRaw)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {t.feeClaimCount}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      className="ag-btn ag-btn--ghost ag-btn--sm"
                      href={`/${t.agent}/token`}
                    >
                      Trade
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
