import { getAgentProfile, listAgentsForOwner } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActiveToggle } from "@/components/active-toggle";
import { AgentEditForm } from "@/components/agent-edit-form";
import { CatalogEditor } from "@/components/catalog-editor";
import { SellServiceCard } from "@/components/sell-service-card";
import { getSelfDeploy } from "@/lib/deploy-self";

// /manage/agents/[address] — the Edit-listing ROUTE (founder call, S.656:
// a real page, not an inline expand; design EditListing.jsx). Guarded to
// the signed-in owner: the Passport itself (self-agent) or a confirmed
// owned agent.

export const metadata: Metadata = { title: "Edit listing" };

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default async function EditListingPage({
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

  // The live wrap's non-secret config (upstream, method, header names) —
  // prefills the service form so it never opens blank (S.657).
  const currentWrap = isSelf ? await getSelfDeploy(agent.address) : null;

  return (
    <div className="max-w-[780px]">
      <Link
        className="mb-5 inline-flex items-center gap-[7px] font-mono text-[12.5px] text-fg-subtle no-underline transition-colors hover:text-foreground"
        href="/manage/agents"
      >
        ← Back
      </Link>
      <h1 className="m-0 font-semibold text-[28px] text-foreground tracking-[-0.03em]">
        Edit listing
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
            priceUsdc: agent.priceUsdc ?? null,
            category: agent.category ?? null,
            website: agent.website ?? null,
            twitter: agent.twitter ?? null,
            github: agent.github ?? null,
          }}
        />

        {/* The service CATALOG — owner-editable since S.693 (founder GO
            reversed S.656's read-only stance: browser-created owned agents
            must be sellable without a terminal). Same REPLACE semantics as
            `t2 agent services`. */}
        <CatalogEditor
          agent={agent.address}
          initial={(agent.services ?? []).map((s) => ({
            slug: s.slug,
            title: s.title,
            description: s.description,
            priceUsdc: s.priceUsdc,
            input: s.input ?? "",
            endpoint: s.endpoint ?? "",
            method: s.method === "GET" ? "GET" : "POST",
            active: s.active !== false,
          }))}
        />

        {/* The service block (design §ServiceDeployBlock) — Passport
            self-agents deploy from the browser; owned agents set their
            endpoint themselves from the CLI. */}
        {isSelf ? (
          <SellServiceCard
            address={agent.address}
            category={agent.category}
            currentWrap={currentWrap}
            mcpEndpoint={agent.mcpEndpoint}
            priceUsdc={agent.priceUsdc}
          />
        ) : (
          agent.mcpEndpoint && (
            <p className="m-0 font-mono text-[11.5px] text-fg-subtle leading-[1.55]">
              Service endpoint:{" "}
              <span className="break-all text-fg-muted">
                {agent.mcpEndpoint}
              </span>{" "}
              — set on-chain by the agent itself (t2 agent service / deploy).
            </p>
          )
        )}

        {/* On-chain kill switch (registry set_active) — self-agent signs with
            the Passport, sponsored. Reversible; the record + history persist. */}
        {isSelf && <ActiveToggle active={agent.active} />}

        <p className="m-0 font-mono text-[11.5px] text-fg-subtle leading-[1.55]">
          Listing fields are off-chain; the endpoint &amp; price are set
          on-chain. Changes show on the public profile after the page
          revalidates (~30s). View it live at{" "}
          <Link className="text-fg-muted" href={`/${agent.address}`}>
            agents.t2000.ai/{short(agent.address)}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
