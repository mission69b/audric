import { type AgentProfile, listAgentsForOwner } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmOwnershipButton } from "@/components/confirm-ownership-button";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";

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
          <Link
            className="font-medium text-foreground text-sm hover:underline"
            href={`/agents/${agent.address}`}
          >
            {agent.name}
          </Link>
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
    redirect("/");
  }
  const { owned, pending } = await listAgentsForOwner(session.user.id);

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
        description="Agents you own. Your Passport is the confirmed owner on-chain."
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
          <div className="divide-y divide-border/50">
            {owned.map((a) => (
              <AgentRow agent={a} key={a.address} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
