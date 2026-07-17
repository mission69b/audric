import { getAgentProfile, listAgentsForOwner } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActiveToggle } from "@/components/active-toggle";
import { AgentActionButton } from "@/components/agent-action-dialog";
import { AgentEditForm } from "@/components/agent-edit-form";
import { formatDate } from "@/lib/format";
import {
  fetchGatewayServices,
  fetchServiceStats,
  findServiceByWallet,
  serviceUrl,
} from "@/lib/gateway-services";
import { fetchWalletUsdc } from "@/lib/wallet-usdc";

// /manage/agents/[address] — the Edit-agent ROUTE (founder call, S.656:
// a real page, not an inline expand). Guarded to the signed-in owner: the
// Passport itself (self-agent) or a confirmed owned agent.

export const metadata: Metadata = { title: "Edit agent" };

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }

  const isSelf = address.toLowerCase() === session.user.id.toLowerCase();
  if (!isSelf) {
    const { owned } = await listAgentsForOwner(session.user.id);
    if (!owned.some((a) => a.address.toLowerCase() === address.toLowerCase())) {
      notFound();
    }
  }

  const agent = await getAgentProfile(address);
  if (!agent) {
    notFound();
  }

  // Existing catalog listing (payTo match) — shows selling status. The
  // listing itself is managed on mpp.t2000.ai/sell (zero-friction: the API
  // is the account); this page only reflects it. Owned (linked) agents show
  // it too — the claimed payTo wallet is exactly what the human manages here.
  const cataloged = findServiceByWallet(
    await fetchGatewayServices(),
    agent.address
  );
  // Earnings — receipts-derived sales from the rail's payment log, plus the
  // wallet's live on-chain USDC. Both best-effort: the page renders without.
  const [sales, walletUsdc] = await Promise.all([
    cataloged ? fetchServiceStats(cataloged.id) : Promise.resolve(null),
    fetchWalletUsdc(agent.address),
  ]);

  return (
    <div className="max-w-[780px]">
      <Link
        className="mb-5 inline-flex items-center gap-[7px] font-mono text-[12.5px] text-fg-subtle no-underline transition-colors hover:text-foreground"
        href="/manage/agents"
      >
        ← Back
      </Link>
      <h1 className="m-0 font-semibold text-[28px] text-foreground tracking-[-0.03em]">
        Edit agent
      </h1>
      <div className="mt-1.5 font-mono text-[12.5px] text-fg-subtle">
        {agent.displayName || agent.name}
        {agent.numericId != null && <> · #{agent.numericId}</>} ·{" "}
        {short(agent.address)}
      </div>

      <div className="mt-[26px] grid gap-4">
        <AgentEditForm
          agent={{
            address: agent.address,
            name: agent.name,
            displayName: agent.displayName ?? null,
            imageUrl: agent.imageUrl ?? null,
            description: agent.description ?? null,
            category: agent.category ?? null,
            website: agent.website ?? null,
            twitter: agent.twitter ?? null,
            github: agent.github ?? null,
          }}
        />

        {/* Selling status. The listing flow itself lives at mpp.t2000.ai/sell
            ([SPEC_T2_AGENTS_STORE] one sell path — paste a URL, no account);
            this card only reflects the current state for this wallet. */}
        {isSelf ? (
          <div className="ag-card grid gap-3 p-6">
            <div>
              <div className="font-semibold text-[14.5px] text-foreground">
                Sell your API
              </div>
              <p className="m-0 mt-1 text-[12.5px] text-fg-subtle leading-relaxed">
                {cataloged ? (
                  <>
                    This wallet sells{" "}
                    <a
                      className="font-medium"
                      href={serviceUrl(cataloged)}
                      rel="noopener noreferrer"
                      style={{ color: "var(--ag-accent)" }}
                      target="_blank"
                    >
                      {cataloged.name} →
                    </a>{" "}
                    ({cataloged.endpoints.length}{" "}
                    {cataloged.endpoints.length === 1
                      ? "endpoint"
                      : "endpoints"}
                    ). Re-probed daily; changed your prices or spec? Paste your
                    URL on the sell page to refresh instantly.
                  </>
                ) : (
                  <>
                    Charge USDC per call with x402 — paste your endpoint URL,
                    machines check it, and you&apos;re listed. No sign-up;
                    payment settles straight to the wallet your 402 names.
                  </>
                )}
              </p>
            </div>
            <div>
              <a
                className="ag-btn ag-btn--primary no-underline"
                href="https://mpp.t2000.ai/sell"
                rel="noreferrer"
              >
                {cataloged ? "Manage on the sell page" : "Start selling"} →
              </a>
            </div>
          </div>
        ) : (
          agent.mcpEndpoint && (
            <p className="m-0 font-mono text-[11.5px] text-fg-subtle leading-[1.55]">
              Endpoint:{" "}
              <span className="break-all text-fg-muted">
                {agent.mcpEndpoint}
              </span>{" "}
              — set on-chain by the agent itself.
            </p>
          )
        )}

        {/* Earnings — the wallet's live USDC + receipts-derived sales from
            the rail's payment log (the same rows the public store page
            renders). The console never keeps a ledger of its own. */}
        <div className="ag-card grid gap-4 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="font-semibold text-[14.5px] text-foreground">
              Earnings
            </div>
            <Link
              className="font-mono text-[11.5px] text-fg-subtle no-underline transition-colors hover:text-foreground"
              href={`/${agent.address}`}
            >
              public store page →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [
                "Wallet USDC",
                walletUsdc == null ? "—" : `$${walletUsdc.toFixed(2)}`,
              ],
              ["Sold", sales ? String(sales.sold) : "0"],
              ["Buyers", sales ? String(sales.buyers) : "0"],
              ["Settled", sales ? `$${sales.settledUsd}` : "$0"],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="font-semibold text-[18px] text-foreground tracking-[-0.02em]">
                  {value}
                </div>
                <div className="mt-0.5 text-[11px] text-fg-subtle uppercase tracking-wide">
                  {label}
                </div>
              </div>
            ))}
          </div>
          {sales && sales.recent.length > 0 ? (
            <div
              className="divide-y divide-border/50 rounded-lg border"
              style={{ borderColor: "var(--ag-border)" }}
            >
              {sales.recent.slice(0, 5).map((r) => (
                <div
                  className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]"
                  key={`${r.createdAt}-${r.endpoint}`}
                >
                  <span className="truncate font-mono text-muted-foreground">
                    {r.endpoint}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-foreground">
                      ${r.amount}
                    </span>
                    <span className="text-fg-subtle text-xs">
                      {formatDate(r.createdAt)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12.5px] text-fg-subtle leading-relaxed">
              No sales yet.{" "}
              {cataloged
                ? "The listing is live — sales settle straight to this wallet and show up here."
                : "List an API and every settlement lands here, receipt-backed."}
            </p>
          )}
        </div>

        {/* On-chain controls — BOTH on-chain actions live here, together
            (S.705: they were split across two pages and read as one thing).
            · Deactivate = the AGENT's status (registry set_active; hides it
              from the directory; reversible; ownership unchanged).
            · Unlink = YOUR relationship (renounce ownership; the agent goes
              autonomous; its active status unchanged; permanent unless the
              agent proposes you again). */}
        <div className="ag-card grid gap-4 p-6">
          <div>
            <div className="font-semibold text-[14.5px] text-foreground">
              On-chain controls
            </div>
            <p className="m-0 mt-1 text-[12.5px] text-fg-subtle leading-relaxed">
              Two separate levers: <b className="text-fg-muted">Deactivate</b>{" "}
              flips the agent&apos;s live status (leaves the directory,
              reversible, you stay the owner).{" "}
              <b className="text-fg-muted">Unlink</b> renounces your ownership
              (the agent goes autonomous; its status doesn&apos;t change). Both
              are one sponsored, gasless signature.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ActiveToggle
              active={agent.active}
              agent={isSelf ? undefined : agent.address}
            />
            {!isSelf && (
              <AgentActionButton
                action="unlink"
                active={agent.active}
                agent={agent.address}
                name={agent.displayName || agent.name}
              />
            )}
          </div>
        </div>

        <p className="m-0 font-mono text-[11.5px] text-fg-subtle leading-[1.55]">
          Profile fields are off-chain. Changes show on the public profile after
          the page revalidates (~30s). View it live at{" "}
          <Link className="text-fg-muted" href={`/${agent.address}`}>
            agents.t2000.ai/{short(agent.address)}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
