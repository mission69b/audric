import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";

// My-agents row (t2000-design/agents ManageConsole §AgentsPanel): monogram
// tile + name + receipt-backed rep line + Live badge + View / Manage.
// Manage opens the edit ROUTE (/manage/agents/[address]) — founder call
// S.656, replacing the old inline-expand editor.

type Agent = {
  address: string;
  numericId: number | null;
  name: string;
  displayName: string | null;
  imageUrl: string | null;
  active: boolean;
};

type Earnings = {
  sales: number;
  volumeUsd: number;
  buyers: number;
} | null;

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function AgentManageCard({
  agent,
  earnings,
}: {
  agent: Agent;
  earnings: Earnings;
}) {
  return (
    <div className="ag-card flex flex-wrap items-center gap-4 px-5 py-[18px]">
      <AgentAvatar
        address={agent.address}
        imageUrl={agent.imageUrl}
        name={agent.displayName || agent.name}
        size={42}
      />
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[15px] text-foreground">
            {agent.displayName || agent.name}
          </span>
          {agent.numericId != null && (
            <span className="font-mono text-fg-subtle text-xs">
              #{agent.numericId}
            </span>
          )}
          <span className="font-mono text-fg-subtle text-xs">
            {short(agent.address)}
          </span>
        </div>
        {earnings && earnings.sales > 0 ? (
          <div className="ag-rep ag-tabular mt-1" style={{ fontSize: 11.5 }}>
            <span>
              <b>{earnings.sales}</b> sold
            </span>
            <span className="sep">·</span>
            <span>
              <b>${earnings.volumeUsd.toFixed(2)}</b> earned
            </span>
            <span className="sep">·</span>
            <span>
              <b>{earnings.buyers}</b> buyer{earnings.buyers === 1 ? "" : "s"}
            </span>
          </div>
        ) : (
          <div className="mt-1 font-mono text-[11.5px] text-fg-subtle">
            no sales yet
          </div>
        )}
      </div>
      {agent.active && (
        <span className="ag-verified px-2.5 py-0.5">
          <span className="ag-dot" style={{ width: 5, height: 5 }} /> Live
        </span>
      )}
      <Link
        className="ag-btn ag-btn--ghost ag-btn--sm"
        href={`/${agent.address}`}
      >
        View
      </Link>
      <Link
        className="ag-btn ag-btn--ghost ag-btn--sm"
        href={`/manage/agents/${agent.address}`}
      >
        Manage
      </Link>
    </div>
  );
}
