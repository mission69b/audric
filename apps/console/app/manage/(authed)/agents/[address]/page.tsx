import { getAgentProfile, listAgentsForOwner } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActiveToggle } from "@/components/active-toggle";
import { AgentActionButton } from "@/components/agent-action-dialog";
import { AgentEditForm } from "@/components/agent-edit-form";
import { SellApiCard } from "@/components/sell-api-card";
import {
  fetchGatewayServices,
  findServiceByWallet,
  serviceUrl,
} from "@/lib/gateway-services";

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

  // Existing MPP catalog listing (payTo match) — drives the SellApiCard's
  // catalog step (list vs re-submit). Self-agent only; degrades to null.
  const cataloged = isSelf
    ? findServiceByWallet(await fetchGatewayServices(), agent.address)
    : undefined;

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

        {/* Seller flow (S.716): registry `update` is signer == agent, so only
            the SELF-agent's listing is editable here. Owned third-party
            agents set their endpoint themselves (their key signs). */}
        {isSelf ? (
          <SellApiCard
            address={agent.address}
            catalogUrl={cataloged ? serviceUrl(cataloged) : null}
            currentEndpoint={agent.mcpEndpoint ?? null}
          />
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
