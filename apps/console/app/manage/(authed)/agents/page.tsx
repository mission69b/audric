import {
  type AgentProfile,
  getAgentProfile,
  listAgentsForOwner,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import {
  AgentActionButton,
  RestoreButton,
} from "@/components/agent-action-dialog";
import {
  type AgentEarnings,
  AgentManageCard,
} from "@/components/agent-manage-card";
import { ConfirmOwnershipButton } from "@/components/confirm-ownership-button";
import { CopyButton } from "@/components/copy-button";
import { PanelHead } from "@/components/panel-head";
import { RegisterSelfCard } from "@/components/register-self-card";
import { Badge } from "@/components/ui/badge";
import {
  fetchGatewayServices,
  fetchServiceStats,
  findServiceByWallet,
} from "@/lib/gateway-services";
import { fetchWalletUsdc } from "@/lib/wallet-usdc";

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
      <div className="flex shrink-0 items-center gap-2">
        <AgentActionButton
          action="dismiss"
          agent={agent.address}
          name={agent.displayName || agent.name}
        />
        <ConfirmOwnershipButton agent={agent.address} />
      </div>
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
  const [{ owned, pending, archived }, selfAgent, services] = await Promise.all(
    [
      listAgentsForOwner(session.user.id),
      getAgentProfile(session.user.id),
      fetchGatewayServices(),
    ]
  );

  // Earnings at the LIST level (founder call 2026-07-17 late: no click-in
  // needed) — live wallet USDC + rail sales for every row. Best-effort;
  // rows render with "—" on RPC hiccups.
  const earningsFor = async (address: string): Promise<AgentEarnings> => {
    const cataloged = findServiceByWallet(services, address);
    const [walletUsdc, stats] = await Promise.all([
      fetchWalletUsdc(address),
      cataloged ? fetchServiceStats(cataloged.id) : Promise.resolve(null),
    ]);
    return {
      walletUsdc,
      sold: stats?.sold ?? 0,
      settledUsd: stats?.settledUsd ?? "0",
    };
  };
  const rows = [
    ...(selfAgent ? [selfAgent.address] : []),
    ...owned.map((a) => a.address),
  ];
  const earningsList = await Promise.all(rows.map(earningsFor));
  const earnings = new Map(rows.map((addr, i) => [addr, earningsList[i]]));

  // The agent registers itself from where it RUNS (its key must live with
  // it) — the console never mints agent keys (S.705: the browser create
  // flow was deleted; a sessionStorage-stashed key is how records get
  // orphaned). Prompt-first (the /join pattern): hand the whole flow to the
  // agent; the raw command is the doing-it-yourself footnote.
  const createCmd = `t2 agent create --name "My Agent" --owner ${session.user.id}`;
  const createPrompt = `Register yourself as an agent on t2 Agents (agents.t2000.ai). Install @t2000/cli, then run \`t2 agent create --name "<your name>" --owner ${session.user.id}\` — that creates your wallet + free on-chain Agent ID and proposes me as owner. Ask me what to name you. I'll confirm ownership in the console afterwards.`;

  return (
    <>
      <PanelHead
        sub="Agents you operate — Manage opens the agent editor."
        title="My agents"
      />

      <GroupLabel>You — your Passport, registered as an agent</GroupLabel>
      {selfAgent ? (
        <AgentManageCard
          agent={selfAgent}
          earnings={earnings.get(selfAgent.address)}
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
          You don&apos;t own any agents yet — link one below.
        </p>
      ) : (
        <div className="grid gap-3.5">
          {owned.map((a) => (
            <AgentManageCard
              agent={a}
              earnings={earnings.get(a.address)}
              key={a.address}
            />
          ))}
        </div>
      )}

      {/* New agent = a CLI moment, not a form. The keypair must live where
          the agent runs; the console's job is ownership + management. */}
      <GroupLabel>New agent — from where your agent runs</GroupLabel>
      <div className="ag-card p-5">
        <p className="m-0 text-[13px] text-fg-muted leading-relaxed">
          An agent registers itself so its key stays on its own machine — the
          console never holds agent keys. Hand this to your agent, then confirm
          the ownership request that appears above:
        </p>
        <div
          className="mt-3 rounded-[10px] border border-dashed px-4 py-3.5"
          style={{ borderColor: "var(--ag-border)" }}
        >
          <div className="flex flex-wrap items-start gap-2">
            <p className="m-0 flex-1 basis-[280px] break-words font-mono text-[12px] text-fg-muted leading-[1.6] [overflow-wrap:anywhere]">
              {createPrompt}
            </p>
            <CopyButton label="Copy prompt" text={createPrompt} />
          </div>
          <p className="m-0 mt-2.5 text-[11.5px] text-fg-subtle">
            Paste into your agent — Claude Code, Cursor, anything with a
            terminal.
          </p>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px] text-fg-subtle">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Doing it yourself?{" "}
            <span className="font-mono">npm i -g @t2000/cli</span> then{" "}
            <span className="font-mono">{createCmd}</span>
          </span>
          <CopyButton text={createCmd} />
        </div>
        <p className="mt-2 mb-0 text-[11.5px] text-fg-subtle">
          An existing agent links with{" "}
          <span className="font-mono">
            t2 agent link {short(session.user.id)}…
          </span>
        </p>
      </div>

      {archived.length > 0 && (
        <>
          <GroupLabel>Hidden — restore anytime</GroupLabel>
          <div className="ag-card overflow-hidden">
            {archived.map((a) => (
              <div
                className="flex items-center justify-between gap-4 px-5 py-3 first:border-t-0"
                key={a.address}
                style={{ borderTop: "1px solid var(--ag-border)" }}
              >
                <div className="min-w-0">
                  <span className="text-fg-muted text-sm">
                    {a.displayName || a.name}
                  </span>
                  <span className="ml-2 font-mono text-fg-subtle text-xs">
                    {short(a.address)}
                  </span>
                </div>
                <RestoreButton agent={a.address} />
              </div>
            ))}
          </div>
          <p className="mt-2 mb-0 text-fg-subtle text-xs">
            Dismissed proposals and previously hidden agents — restore brings
            them back (their on-chain records always persist).
          </p>
        </>
      )}
    </>
  );
}
