import {
  getAgentProfile,
  getCreditBalanceMicros,
  getUserById,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { displayHandle, queryBalance } from "@t2000/sdk";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DepositAddress } from "@/components/deposit-address";
import { QuickstartSection } from "@/components/quickstart-section";
import { RegisterSelfCard } from "@/components/register-self-card";
import { Section } from "@/components/section";
import { env } from "@/lib/env";

// Wallet USDC (on-chain) — the money Try-it + agent payments spend, distinct
// from platform credit (§II.15b.5). Best-effort: RPC hiccups render "—".
async function fetchWalletUsdc(address: string): Promise<number | null> {
  try {
    const network =
      env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
    const client = new SuiGrpcClient({
      baseUrl:
        network === "testnet"
          ? "https://fullnode.testnet.sui.io"
          : "https://fullnode.mainnet.sui.io",
      network,
    });
    const balance = await queryBalance(client, address);
    return balance.stables.USDC ?? 0;
  } catch {
    return null;
  }
}

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

export default async function OverviewPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const [balanceMicros, user, selfAgent, walletUsdc] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    getUserById(session.user.id),
    getAgentProfile(session.user.id),
    fetchWalletUsdc(session.user.id),
  ]);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);
  const handle = user?.username ? displayHandle(user.username) : null;

  return (
    <>
      {/* Consent-first self-registration — visible until the Passport has an
          Agent ID (§II.15b.1: explicit, never silent). */}
      {!selfAgent && (
        <div className="mb-4">
          <RegisterSelfCard />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section>
          <div className="text-muted-foreground text-xs">Credit balance</div>
          <div className="mt-1 font-semibold text-3xl text-foreground tabular-nums">
            ${balance}
          </div>
          <Link
            className="mt-2 inline-block text-muted-foreground text-xs underline transition-colors hover:text-foreground"
            href="/manage/billing"
          >
            Add credit
          </Link>
        </Section>
        <Section>
          <div className="text-muted-foreground text-xs">Passport</div>
          <div className="mt-1 font-mono text-foreground text-sm">
            {handle ?? shortAddress(session.user.id)}
          </div>
          {handle ? (
            <div
              className="mt-0.5 font-mono text-muted-foreground text-xs"
              title={session.user.id}
            >
              {shortAddress(session.user.id)}
            </div>
          ) : null}
          {session.user.email ? (
            <div className="mt-0.5 text-muted-foreground text-xs">
              {session.user.email}
            </div>
          ) : null}
        </Section>
      </div>

      {/* Wallet panel (§II.15b.5): the ON-CHAIN pot — what Try-it and agent
          payments spend. Named explicitly so it's never confused with credit. */}
      <div className="mt-4">
        <Section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-muted-foreground text-xs">
              Wallet USDC (on-chain)
            </div>
            <div className="text-muted-foreground/60 text-xs">
              funds store purchases + agent payments
            </div>
          </div>
          <div className="mt-1 font-semibold text-3xl text-foreground tabular-nums">
            {walletUsdc === null ? "—" : `$${walletUsdc.toFixed(2)}`}
          </div>
          <DepositAddress address={session.user.id} />
        </Section>
      </div>

      <QuickstartSection />
    </>
  );
}
