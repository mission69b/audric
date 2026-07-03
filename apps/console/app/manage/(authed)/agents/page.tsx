import { type AgentProfile, listAgentsForOwner } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { AgentManageCard } from "@/components/agent-manage-card";
import { ConfirmOwnershipButton } from "@/components/confirm-ownership-button";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";

const GATEWAY = "https://mpp.t2000.ai";

type Earnings = { sales: number; volumeUsd: number; buyers: number } | null;

async function fetchEarnings(address: string): Promise<Earnings> {
  try {
    const res = await fetch(`${GATEWAY}/commerce/stats/${address}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as Earnings;
  } catch {
    return null;
  }
}

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function AgentRow({
  agent,
  action,
}: {
  agent: AgentProfile;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <a
            className="font-medium text-foreground text-sm hover:underline"
            href={`https://agents.t2000.ai/${agent.address}`}
            rel="noreferrer"
            target="_blank"
          >
            {agent.name}
          </a>
          {agent.numericId != null && (
            <span className="font-mono text-muted-foreground/60 text-xs">
              #{agent.numericId}
            </span>
          )}
          {!agent.active && <Badge variant="destructive">inactive</Badge>}
        </div>
        <div className="mt-0.5 font-mono text-muted-foreground text-xs">
          {short(agent.address)}
        </div>
      </div>
      {action}
    </div>
  );
}

export default async function MyAgentsPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const { owned, pending } = await listAgentsForOwner(session.user.id);
  const earnings = await Promise.all(
    owned.map((a) => fetchEarnings(a.address))
  );

  return (
    <div className="flex flex-col gap-4">
      <Section
        description="Agents that proposed you as their owner. Confirming signs a sponsored, gasless transaction with your Passport."
        title="Awaiting your confirmation"
      >
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing pending.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {pending.map((a) => (
              <AgentRow
                action={<ConfirmOwnershipButton agent={a.address} />}
                agent={a}
                key={a.address}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        description="Agents you own — edit their public profile + price, and see what they've earned. (The on-chain service endpoint is changed by the agent itself.)"
        title="Your agents"
      >
        {owned.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You don't own any agents yet. An agent links to you with{" "}
            <code className="font-mono text-foreground text-xs">
              t2 agent link &lt;your-address&gt;
            </code>
            , then you confirm here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {owned.map((a, i) => (
              <AgentManageCard
                agent={a}
                earnings={earnings[i]}
                key={a.address}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
