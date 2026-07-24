import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import { FundAgent } from "@/components/fund-agent";

// My-agents row: monogram tile + name + Live badge + View / Manage.
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

/** Receipts-derived earnings summary, computed by the list page (wallet
 *  USDC on-chain + rail sales stats). Null = not loaded / not applicable. */
export type AgentEarnings = {
  walletUsdc: number | null;
  sold: number;
  settledUsd: string;
};

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function AgentManageCard({
  agent,
  fundable = true,
  earnings = null,
}: {
  agent: Agent;
  /** False for the SELF row — funding your own Passport from itself is a
   *  no-op self-send (founder catch, first live test). */
  fundable?: boolean;
  earnings?: AgentEarnings | null;
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
        {earnings && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11.5px] text-fg-subtle">
            <span>
              {earnings.walletUsdc == null
                ? "— USDC"
                : `$${earnings.walletUsdc.toFixed(2)} USDC`}
            </span>
            {earnings.sold > 0 && (
              <>
                <span>sold · {earnings.sold}</span>
                <span>settled · ${earnings.settledUsd}</span>
              </>
            )}
          </div>
        )}
      </div>
      {agent.active && (
        <span className="ag-verified px-2.5 py-0.5">
          <span className="ag-dot" style={{ width: 5, height: 5 }} /> Live
        </span>
      )}
      {fundable && <FundAgent agentAddress={agent.address} />}
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
      <Link
        className="ag-btn ag-btn--ghost ag-btn--sm"
        href={`/${agent.address}/token`}
      >
        Token
      </Link>
    </div>
  );
}
