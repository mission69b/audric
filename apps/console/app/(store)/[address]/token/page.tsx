import {
  getAgentProfile,
  getAgentToken,
  listFeeClaims,
} from "@audric/accounts";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { TokenizePanel } from "@/components/tokenize-panel";
import { formatDate, shortAddress } from "@/lib/format";

// The per-agent token page (SPEC_ACP_SUI §6 item 3): chart, allocations,
// the 10-year LP lock, and the fee-to-agent ledger — every number event- or
// chain-derived, digests linked (§8 "no fake numbers"). Un-tokenized agents
// get the TokenizePanel (auth is on-chain; strangers' attempts abort).
export const dynamic = "force-dynamic";

const EXPLORER = "https://suiscan.xyz/mainnet";

function fmtRaw(raw: number, decimals: number, dp: number): string {
  // Floor, never round up (t2000-financial-amounts).
  const v = raw / 10 ** decimals;
  const f = 10 ** dp;
  return (Math.floor(v * f) / f).toLocaleString("en-US", {
    maximumFractionDigits: dp,
  });
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  let agent: string;
  try {
    agent = normalizeSuiAddress(address);
  } catch {
    notFound();
  }

  const [token, profile] = await Promise.all([
    getAgentToken(agent),
    getAgentProfile(agent),
  ]);
  const name = profile?.name ?? shortAddress(agent);

  if (!token?.finalizedAtMs) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-6 py-10">
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">
          Tokenize {name}
        </h1>
        <p className="mt-1 mb-6 text-[13px] text-fg-subtle">
          A one-time, agent-bound token: fixed 1B supply, LP locked 10 years,
          pool fees to the agent&apos;s wallet. Only the agent or its confirmed
          owner can launch — enforced on-chain.
        </p>
        <div className="ag-card p-6">
          <TokenizePanel agent={agent} agentName={profile?.name ?? undefined} />
        </div>
      </main>
    );
  }

  const claims = await listFeeClaims(agent, 50);
  const symbol = token.symbol;

  return (
    <main className="mx-auto w-full max-w-[1000px] px-6 py-10">
      <div className="flex items-center gap-3">
        <AgentAvatar address={agent} imageUrl={profile?.imageUrl} size={40} />
        <div>
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">
            {name} <span className="font-mono text-fg-subtle">${symbol}</span>
          </h1>
          <p className="m-0 text-[12px] text-fg-subtle">
            Agent token · fees fund the agent
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <a
            className="ag-btn ag-btn--primary"
            href={`https://app.cetus.zone/swap?from=0x2::sui::SUI&to=${encodeURIComponent(token.coinType)}`}
            rel="noreferrer"
            target="_blank"
          >
            Trade on Cetus
          </a>
          <Link className="ag-btn ag-btn--ghost" href={`/${agent}`}>
            Agent profile
          </Link>
        </div>
      </div>

      {/* Chart — GeckoTerminal pool embed (indexes Cetus CLMM pools). */}
      {token.poolId && (
        <div className="ag-card mt-6 overflow-hidden">
          <iframe
            allow="clipboard-write"
            className="h-[420px] w-full border-0"
            src={`https://www.geckoterminal.com/sui-network/pools/${token.poolId}?embed=1&info=0&swaps=0&light_chart=0`}
            title={`$${symbol} chart`}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="ag-card p-4">
          <p className="m-0 text-[11px] uppercase tracking-wide text-fg-subtle">
            Allocation
          </p>
          <p className="m-0 mt-1 text-[15px] font-semibold">
            50% pool · 50% agent
          </p>
          <p className="m-0 text-[12px] text-fg-subtle">
            1B fixed supply, mint + metadata frozen, package immutable
          </p>
        </div>
        <div className="ag-card p-4">
          <p className="m-0 text-[11px] uppercase tracking-wide text-fg-subtle">
            LP lock
          </p>
          <p className="m-0 mt-1 text-[15px] font-semibold">10 years</p>
          {token.lockId && (
            <a
              className="font-mono text-[12px] text-fg-subtle underline"
              href={`${EXPLORER}/object/${token.lockId}`}
              rel="noreferrer"
              target="_blank"
            >
              {shortAddress(token.lockId)}
            </a>
          )}
        </div>
        <div className="ag-card p-4">
          <p className="m-0 text-[11px] uppercase tracking-wide text-fg-subtle">
            Fees to agent (lifetime)
          </p>
          <p className="m-0 mt-1 text-[15px] font-semibold">
            {fmtRaw(token.feesClaimedSuiRaw, 9, 4)} SUI ·{" "}
            {fmtRaw(token.feesClaimedAgentRaw, 6, 2)} {symbol}
          </p>
          <p className="m-0 text-[12px] text-fg-subtle">
            {token.feeClaimCount} claim{token.feeClaimCount === 1 ? "" : "s"} —
            paid to the agent wallet only
          </p>
        </div>
      </div>

      <div className="ag-card mt-6 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 text-[14px] font-semibold">Fee ledger</h2>
          <a
            className="text-[12px] text-fg-subtle underline"
            href={`${EXPLORER}/account/${agent}`}
            rel="noreferrer"
            target="_blank"
          >
            Holders + balances on Suiscan
          </a>
        </div>
        {claims.length === 0 ? (
          <p className="m-0 mt-2 text-[13px] text-fg-subtle">
            No fee claims yet. Anyone can trigger a claim; proceeds always go to
            the agent&apos;s wallet.
          </p>
        ) : (
          <table className="mt-2 w-full text-[13px]">
            <tbody>
              {claims.map((c) => (
                <tr
                  className="border-t"
                  key={c.id}
                  style={{ borderColor: "var(--ag-border)" }}
                >
                  <td className="py-2 text-fg-subtle">
                    {formatDate(new Date(c.timestampMs).toISOString())}
                  </td>
                  <td className="py-2 font-mono">
                    {fmtRaw(
                      c.coinTypeA.endsWith("::sui::SUI")
                        ? c.amountB
                        : c.amountA,
                      6,
                      2
                    )}{" "}
                    {symbol}
                  </td>
                  <td className="py-2 font-mono">
                    {fmtRaw(
                      c.coinTypeA.endsWith("::sui::SUI")
                        ? c.amountA
                        : c.amountB,
                      9,
                      4
                    )}{" "}
                    SUI
                  </td>
                  <td className="py-2 text-right">
                    <a
                      className="font-mono text-[12px] text-fg-subtle underline"
                      href={`${EXPLORER}/tx/${c.txDigest}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {c.txDigest.slice(0, 10)}…
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
