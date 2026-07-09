import {
  type AgentProfile,
  getAgentProfile,
  listAgentsForOwner,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { AgentManageCard } from "@/components/agent-manage-card";
import { ConfirmOwnershipButton } from "@/components/confirm-ownership-button";
import { PanelHead } from "@/components/panel-head";
import { RegisterSelfCard } from "@/components/register-self-card";
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

function PendingRow({ agent }: { agent: AgentProfile }) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-5 py-3.5 first:border-t-0"
      style={{ borderTop: "1px solid var(--ag-border)" }}
    >
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
            <span className="font-mono text-fg-subtle text-xs">
              #{agent.numericId}
            </span>
          )}
          {!agent.active && <Badge variant="destructive">inactive</Badge>}
        </div>
        <div className="mt-0.5 font-mono text-fg-subtle text-xs">
          {short(agent.address)}
        </div>
      </div>
      <ConfirmOwnershipButton agent={agent.address} />
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 mb-2 font-medium font-mono text-[10px] text-fg-subtle uppercase tracking-[0.12em] first:mt-0">
      {children}
    </div>
  );
}

export default async function MyAgentsPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  // The self-agent (§II.15a stage 3): the agent you ARE, not one you own.
  // listAgentsForOwner matches ownership LINKS only, so the Passport's own
  // registration is fetched separately.
  const [{ owned, pending }, selfAgent] = await Promise.all([
    listAgentsForOwner(session.user.id),
    getAgentProfile(session.user.id),
  ]);
  const [selfEarnings, ...earnings] = await Promise.all([
    selfAgent ? fetchEarnings(selfAgent.address) : Promise.resolve(null),
    ...owned.map((a) => fetchEarnings(a.address)),
  ]);

  return (
    <>
      <PanelHead
        action={
          <a
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/80"
            href="/manage/create"
          >
            Create agent
          </a>
        }
        sub="Listings you operate. Each earns to your USDC balance — Manage opens the listing editor."
        title="My agents"
      />

      <GroupLabel>You — your Passport, selling as itself</GroupLabel>
      {selfAgent ? (
        <AgentManageCard
          agent={selfAgent}
          earnings={selfEarnings}
          fundable={false}
        />
      ) : (
        <RegisterSelfCard />
      )}

      {pending.length > 0 && (
        <>
          <GroupLabel>
            Awaiting your confirmation — one gasless signature
          </GroupLabel>
          <div className="ag-card overflow-hidden">
            {pending.map((a) => (
              <PendingRow agent={a} key={a.address} />
            ))}
          </div>
        </>
      )}

      <GroupLabel>Agents you own</GroupLabel>
      {owned.length === 0 ? (
        <p className="m-0 text-fg-muted text-sm">
          You don&apos;t own any agents yet.{" "}
          <a
            className="text-foreground underline underline-offset-4"
            href="/manage/create"
          >
            Create one
          </a>{" "}
          — or an existing agent links to you with{" "}
          <code className="font-mono text-foreground text-xs">
            t2 agent link &lt;your-address&gt;
          </code>
          , then you confirm here.
        </p>
      ) : (
        <div className="grid gap-3.5">
          {owned.map((a, i) => (
            <AgentManageCard agent={a} earnings={earnings[i]} key={a.address} />
          ))}
        </div>
      )}
    </>
  );
}
