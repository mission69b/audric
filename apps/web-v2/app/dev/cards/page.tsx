"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { type ReactNode, useState } from "react";

import { ActivitySummaryCard } from "@/components/audric/cards/ActivitySummaryCard";
import { BalanceCardV2 } from "@/components/audric/cards/BalanceCardV2";
import { ConfirmationChip } from "@/components/audric/cards/ConfirmationChip";
import { ExplainTxCard } from "@/components/audric/cards/ExplainTxCard";
import { HealthCardV2 } from "@/components/audric/cards/HealthCardV2";
import { PaymentLinkCard } from "@/components/audric/cards/PaymentLinkCard";
import { PendingRewardsCardV2 } from "@/components/audric/cards/PendingRewardsCardV2";
import { PortfolioCardV2 } from "@/components/audric/cards/PortfolioCardV2";
import { PriceCard } from "@/components/audric/cards/PriceCard";
import {
  CardShell,
  QRow,
  StaleNote,
} from "@/components/audric/cards/primitives";
import { RatesCardV2 } from "@/components/audric/cards/RatesCardV2";
import { SavingsCard } from "@/components/audric/cards/SavingsCard";
import { SkeletonCard } from "@/components/audric/cards/SkeletonCard";
import { SuinsResolution } from "@/components/audric/cards/SuinsResolution";
import { SwapQuoteCardV2 } from "@/components/audric/cards/SwapQuoteCardV2";
import {
  AddressBlock,
  AssetAmountBlock,
  CardState,
  HFGauge,
  MetricBlock,
  RouteDiagram,
  StatusBlock,
} from "@/components/audric/cards/shared";
import { TransactionHistoryCard } from "@/components/audric/cards/TransactionHistoryCard";
import { TransactionReceiptCard } from "@/components/audric/cards/TransactionReceiptCard";
import { YieldEarningsCard } from "@/components/audric/cards/YieldEarningsCard";
import { PermissionCard } from "@/components/audric/permission-card";
import { cn } from "@/lib/utils";

// Harness no-op callbacks. `noResolve` keeps a tapped Approve in the
// SIGNING (in-flight) visual so it can be screenshot without a backend.
const noop = () => {
  // intentionally empty — harness has no backend
};
const noResolve = () => new Promise<void>(() => undefined);

/**
 * Dev-only preview harness for the Audric card library.
 *
 * [R6.4 / A0 — 2026-05-30] Renders every shared block (and, as A2/A3
 * land, the 9 permission states + 5 read cards) in isolation against
 * fixtures so the rebuild can be screenshot-diffed vs the phase2 HTML
 * prototypes in `t2000-AFI/audric/phase2-*.html`. Theme + width toggles
 * exercise light/dark and desktop/390px. Not linked anywhere; gated to
 * non-production so it never ships to users.
 *
 * Diff loop: `pnpm --filter @audric/web-v2 dev` → open `/dev/cards` →
 * compare each section to its phase2 swatch (open the HTML file beside
 * it) at both themes + both widths.
 */
export default function CardsHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const [narrow, setNarrow] = useState(false);
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Card harness · shared blocks
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-tool-blocks.html"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle
            active={!narrow}
            label="Desktop"
            onClick={() => setNarrow(false)}
          />
          <Toggle
            active={narrow}
            label="390px"
            onClick={() => setNarrow(true)}
          />
          <span className="mx-1 h-4 w-px bg-border" />
          <Toggle
            active={!isDark}
            label="Light"
            onClick={() => setTheme("light")}
          />
          <Toggle
            active={isDark}
            label="Dark"
            onClick={() => setTheme("dark")}
          />
        </div>
      </header>

      <main
        className={cn(
          "mx-auto flex flex-col gap-14 px-6 pt-12 pb-24",
          narrow ? "max-w-[390px]" : "max-w-[1080px]"
        )}
      >
        <Section label="1 · MetricBlock" note="label / value / sub (+ delta)">
          <Swatch>
            <MetricBlock
              label="Total balance"
              sub="across all wallets"
              value="$1,853.04"
            />
          </Swatch>
          <Swatch>
            <MetricBlock
              delta={{ direction: "up", value: "+0.18%" }}
              label="NAVI · USDC"
              sub="vs 7d avg"
              value="5.24%"
            />
          </Swatch>
          <Swatch>
            <MetricBlock
              delta={{ direction: "down", value: "−$0.0001" }}
              label="Daily earnings"
              sub="vs yesterday"
              value="$0.0043"
            />
          </Swatch>
          <Swatch>
            <MetricBlock label="Settled in" sub="Sui mainnet" value="0.41s" />
          </Swatch>
        </Section>

        <Section
          label="2 · AssetAmountBlock"
          note="icon / amount / sym / USD aside"
        >
          <Swatch>
            <AssetAmountBlock amount={547.2} asset="USDC" usdValue={547.2} />
          </Swatch>
          <Swatch>
            <AssetAmountBlock
              amount={142.5}
              asset="SUI"
              suffix="$4.21 each"
              usdValue={600.21}
            />
          </Swatch>
          <Swatch>
            <AssetAmountBlock amount={100.4} asset="USDsui" usdValue={100.4} />
          </Swatch>
          <Swatch>
            <AssetAmountBlock
              amount={600}
              asset="USDC"
              suffix="borrowed"
              tone="warning"
              usdValue={600}
            />
          </Swatch>
        </Section>

        <Section
          label="3 · AddressBlock"
          note="avatar / handle / short-addr (+ tag)"
        >
          <Swatch>
            <AddressBlock address="0xa4b2…c019" handle="alice.audric" />
          </Swatch>
          <Swatch>
            <AddressBlock
              address="0xe1c0…f177"
              handle="funkiii.audric"
              tag="verified"
            />
          </Swatch>
          <Swatch>
            <AddressBlock address="0x7a3b…f29c" tag="raw" />
          </Swatch>
          <Swatch>
            <AddressBlock address="0xa4b2…c019" resolving />
          </Swatch>
        </Section>

        <Section label="4 · StatusBlock" note="dot / label / sub-detail">
          <Swatch>
            <StatusBlock
              detail="0.41s · Hp4o…HHs"
              kind="settled"
              label="Settled"
            />
          </Swatch>
          <Swatch>
            <StatusBlock
              detail="Awaiting finality · ~0.4s"
              kind="pending"
              label="Pending"
            />
          </Swatch>
          <Swatch>
            <StatusBlock
              detail="Insufficient balance · refunded"
              kind="failed"
              label="Reverted"
            />
          </Swatch>
          <Swatch>
            <StatusBlock
              detail="Waiting on prior intent"
              kind="queued"
              label="Queued"
            />
          </Swatch>
        </Section>

        <Section cols={2} label="5 · RouteBlock" note="A → B → C pill chain">
          <Swatch>
            <RouteDiagram
              steps={[
                {
                  fee: "0.05%",
                  fromAsset: "SUI",
                  pool: "Direct",
                  toAsset: "USDC",
                },
              ]}
              totalFeeBps={5}
            />
          </Swatch>
          <Swatch>
            <RouteDiagram
              steps={[
                {
                  fee: "0.1%",
                  fromAsset: "SUI",
                  pool: "Cetus",
                  toAsset: "USDsui",
                },
                {
                  fee: "0.05%",
                  fromAsset: "USDsui",
                  pool: "Cetus",
                  toAsset: "USDC",
                },
              ]}
              totalFeeBps={15}
            />
          </Swatch>
        </Section>

        <Section label="6 · HFGauge" note="health-factor dial · zone by value">
          <Swatch center>
            <HFGauge healthFactor={2.84} liquidationThreshold={1.1} />
          </Swatch>
          <Swatch center>
            <HFGauge healthFactor={1.84} liquidationThreshold={1.1} />
          </Swatch>
          <Swatch center>
            <HFGauge healthFactor={1.42} liquidationThreshold={1.1} />
          </Swatch>
          <Swatch center>
            <HFGauge healthFactor={1.12} liquidationThreshold={1.1} />
          </Swatch>
        </Section>

        <section className="flex flex-col gap-3.5">
          <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            {"// 7 · PermissionCard"}
            <span className="ml-2 text-foreground/60 normal-case tracking-[0.01em]">
              {"diff vs phase2-permission-card.html · live component"}
            </span>
          </span>
          <p className="max-w-[520px] font-mono text-[10.5px] text-muted-foreground leading-[1.6] tracking-[0.02em]">
            {
              "// 01 IDLE · 02 EDITABLE · 04 HINT · 05 BLOCK render the real component. 06 SIGNING shows on Approve-tap (spinner + Passport copy). 03 STALE (no quote-refresh event yet) + 07 PENDING / 08 SUCCESS / 09 ERROR receipts land in A3 (tool-result-router)."
            }
          </p>
          <div className="flex max-w-[520px] flex-col gap-7">
            <PermissionState label="01 IDLE — awaiting confirm">
              <PermissionCard
                denyTimeoutSec={3600}
                description="Save 0.73 USDC into NAVI lending at 5.06% APY."
                input={{ amount: 0.73, asset: "USDC" }}
                modifiableFields={[]}
                onApprove={noop}
                onDeny={noop}
                toolName="save_deposit"
              />
            </PermissionState>

            <PermissionState label="02 EDITABLE — amount user-tunable">
              <PermissionCard
                denyTimeoutSec={3600}
                description="Save USDC into NAVI lending. Edit the amount before approving."
                input={{ amount: 50, asset: "USDC" }}
                modifiableFields={[
                  { name: "amount", kind: "amount", asset: "USDC" },
                ]}
                onApprove={noop}
                onDeny={noop}
                toolName="save_deposit"
              />
            </PermissionState>

            <PermissionState label="04 HINT — guard warns, still approvable">
              <PermissionCard
                denyTimeoutSec={3600}
                description="Gasless transfer · ~0.4s settle."
                guards={[
                  {
                    kind: "hint",
                    message:
                      "$50 of $200 daily cap used today. You'll have $150 left after this transfer.",
                  },
                ]}
                input={{ amount: 50, asset: "USDC", to: "alice.audric" }}
                modifiableFields={[]}
                onApprove={noop}
                onDeny={noop}
                toolName="send_transfer"
              />
            </PermissionState>

            <PermissionState label="05 BLOCK — guard disables Approve">
              <PermissionCard
                denyTimeoutSec={3600}
                description="Gasless transfer · ~0.4s settle."
                guards={[
                  {
                    kind: "block",
                    message:
                      "Exceeds daily cap. $300 attempted, $200 remaining today. Lower the amount or raise the cap in Settings.",
                  },
                ]}
                input={{ amount: 300, asset: "USDC", to: "alice.audric" }}
                modifiableFields={[]}
                onApprove={noop}
                onDeny={noop}
                toolName="send_transfer"
              />
            </PermissionState>

            <PermissionState label="06 SIGNING — tap Approve to enter in-flight">
              <PermissionCard
                denyTimeoutSec={3600}
                description="Save 0.73 USDC into NAVI lending at 5.06% APY."
                input={{ amount: 0.73, asset: "USDC" }}
                modifiableFields={[]}
                onApprove={noResolve}
                onDeny={noop}
                toolName="save_deposit"
              />
            </PermissionState>
          </div>
        </section>

        <section className="flex flex-col gap-3.5">
          <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            {"// 8 · Read cards"}
            <span className="ml-2 text-foreground/60 normal-case tracking-[0.01em]">
              {
                "diff vs phase2-read-cards.html + phase2-wallet-card.html · CardShell + A1 blocks"
              }
            </span>
          </span>
          <div
            className={cn(
              "grid gap-4",
              narrow ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            )}
          >
            <ReadCard label="Balance — wallet + savings + dust">
              <BalanceCardV2 data={MOCK_BALANCE} />
            </ReadCard>
            <ReadCard label="Balance — with debt (amber)">
              <BalanceCardV2 data={MOCK_BALANCE_DEBT} />
            </ReadCard>
            <ReadCard label="Health — safe, no debt">
              <HealthCardV2 data={MOCK_HEALTH_SAFE} />
            </ReadCard>
            <ReadCard label="Health — watch zone, with debt">
              <HealthCardV2 data={MOCK_HEALTH_WATCH} />
            </ReadCard>
            <ReadCard label="Savings — deposit + earnings">
              <SavingsCard data={MOCK_SAVINGS} />
            </ReadCard>
            <ReadCard label="Swap — read-only quote">
              <SwapQuoteCardV2 data={MOCK_SWAP} />
            </ReadCard>
            <ReadCard label="Portfolio — value + allocation">
              <PortfolioCardV2 data={MOCK_PORTFOLIO} />
            </ReadCard>
          </div>
        </section>

        <section className="flex flex-col gap-3.5">
          <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            {"// 9 · Receipts + denials"}
            <span className="ml-2 text-foreground/60 normal-case tracking-[0.01em]">
              {
                "diff vs phase2-receipts-denials.html · P1\u2013P8 + harvest legs + D chips"
              }
            </span>
          </span>
          <div
            className={cn(
              "grid gap-4",
              narrow ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            )}
          >
            <ReadCard label="P1 save">
              <TransactionReceiptCard data={RX_SAVE} toolName="save_deposit" />
            </ReadCard>
            <ReadCard label="P2 withdraw">
              <TransactionReceiptCard data={RX_WITHDRAW} toolName="withdraw" />
            </ReadCard>
            <ReadCard label="P3 send">
              <TransactionReceiptCard data={RX_SEND} toolName="send_transfer" />
            </ReadCard>
            <ReadCard label="P4 borrow">
              <TransactionReceiptCard data={RX_BORROW} toolName="borrow" />
            </ReadCard>
            <ReadCard label="P5 repay">
              <TransactionReceiptCard data={RX_REPAY} toolName="repay_debt" />
            </ReadCard>
            <ReadCard label="P6 claim">
              <TransactionReceiptCard
                data={RX_CLAIM}
                toolName="claim_rewards"
              />
            </ReadCard>
            <ReadCard label="P7 harvest — numbered legs">
              <TransactionReceiptCard
                data={RX_HARVEST}
                toolName="harvest_rewards"
              />
            </ReadCard>
            <ReadCard label="P8 swap">
              <TransactionReceiptCard data={RX_SWAP} toolName="swap_execute" />
            </ReadCard>
          </div>

          <span className="mt-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            {"// D1\u2013D8 · ConfirmationChip denial pills"}
          </span>
          <div className="flex flex-wrap gap-2.5 rounded-[10px] border border-border border-dashed bg-card p-[18px]">
            {[
              "SEND CANCELLED",
              "SAVE CANCELLED",
              "WITHDRAW CANCELLED",
              "SWAP CANCELLED",
              "BORROW CANCELLED",
              "REPAY CANCELLED",
              "CLAIM CANCELLED",
              "PAYMENT LINK CANCELLED",
            ].map((label) => (
              <ConfirmationChip
                glyph={"\u00d7"}
                key={label}
                label={label}
                tone="neutral"
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3.5">
          <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            {"// 10 · Read cards (rest)"}
            <span className="ml-2 text-foreground/60 normal-case tracking-[0.01em]">
              {
                "diff vs phase2-read-cards / -transaction-history / -payment-link"
              }
            </span>
          </span>
          <div
            className={cn(
              "grid gap-4",
              narrow ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            )}
          >
            <ReadCard label="Rates — supply + borrow">
              <RatesCardV2 data={MOCK_RATES} />
            </ReadCard>
            <ReadCard label="Yield — earnings + sparkline">
              <YieldEarningsCard data={MOCK_YIELD} />
            </ReadCard>
            <ReadCard label="Pending rewards">
              <PendingRewardsCardV2 data={MOCK_REWARDS} />
            </ReadCard>
            <ReadCard label="Price — token list">
              <PriceCard data={MOCK_PRICES} />
            </ReadCard>
            <ReadCard label="Price — single token change">
              <PriceCard data={MOCK_PRICE_CHANGE} />
            </ReadCard>
            <ReadCard label="Activity summary">
              <ActivitySummaryCard data={MOCK_ACTIVITY} />
            </ReadCard>
            <ReadCard label="Explain tx">
              <ExplainTxCard data={MOCK_EXPLAIN} />
            </ReadCard>
            <ReadCard label="SuiNS — forward (resolved)">
              <SuinsResolution
                address="0xa4b2c0190000000000000000000000000000000000000000000000000000c019"
                direction="forward"
                query="alice.sui"
                registered
              />
            </ReadCard>
            <ReadCard label="SuiNS — reverse (unresolved)">
              <SuinsResolution
                direction="reverse"
                query="0x9c12000000000000000000000000000000000000000000000000000000b803"
              />
            </ReadCard>
            <ReadCard label="Payment link — created">
              <PaymentLinkCard data={MOCK_LINK_CREATED} />
            </ReadCard>
            <ReadCard label="Payment links — list">
              <PaymentLinkCard data={MOCK_LINK_LIST} />
            </ReadCard>
          </div>

          <div className={narrow ? "" : "max-w-[560px]"}>
            <ReadCard label="Transaction history">
              <TransactionHistoryCard data={MOCK_HISTORY} />
            </ReadCard>
          </div>
        </section>

        <section className="flex flex-col gap-3.5">
          <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            {"// 11 · Read failures"}
            <span className="ml-2 text-foreground/60 normal-case tracking-[0.01em]">
              {
                "diff vs phase2-read-failures.html · loading · feed-down · empty · stale · partial"
              }
            </span>
          </span>
          <div
            className={cn(
              "grid gap-4",
              narrow ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            )}
          >
            <ReadCard label="Loading — compact / wide / list skeletons">
              <div className="flex flex-col gap-2">
                <SkeletonCard variant="compact" />
                <SkeletonCard variant="wide" />
                <SkeletonCard variant="list" />
              </div>
            </ReadCard>

            <ReadCard label="Feed down — price oracle unreachable">
              <CardShell
                badge={
                  <span className="font-mono text-[11px] text-warning">
                    feed offline
                  </span>
                }
                title="SUI price"
              >
                <CardState
                  action={{ label: "Retry" }}
                  sub="The price oracle isn't responding. Your balances are unaffected."
                  title="Price feed unavailable"
                />
              </CardShell>
            </ReadCard>

            <ReadCard label="Empty — pending rewards (live card)">
              <PendingRewardsCardV2 data={MOCK_REWARDS_EMPTY} />
            </ReadCard>

            <ReadCard label="Empty — no savings yet">
              <CardShell
                badge={
                  <span className="font-mono text-[11px] text-muted-foreground">
                    5.24% APY
                  </span>
                }
                title="NAVI savings"
              >
                <CardState
                  action={{ label: "Save now" }}
                  sub="Save idle USDC to earn ~5% APY. Ask Audric to start."
                  title="No savings yet"
                />
              </CardShell>
            </ReadCard>

            <ReadCard label="Degraded — pending rewards feed down (live card)">
              <PendingRewardsCardV2 data={MOCK_REWARDS_DEGRADED} />
            </ReadCard>

            <ReadCard label="Stale — last known value, auto-retrying">
              <CardShell
                badge={
                  <span className="font-mono text-[11px] text-warning">
                    as of 4m ago
                  </span>
                }
                title="USDC rates"
              >
                <div>
                  <QRow label="USDC supply">5.24%</QRow>
                  <QRow label="USDsui supply">6.11%</QRow>
                  <QRow label="USDC borrow">7.12%</QRow>
                </div>
                <StaleNote>Rates may have moved · refreshing…</StaleNote>
              </CardShell>
            </ReadCard>

            <ReadCard label="Partial — one metric unavailable">
              <CardShell
                badge={
                  <span className="font-mono text-[11px] text-muted-foreground">
                    24h
                  </span>
                }
                title="Portfolio"
              >
                <MetricBlock label="Total value" value="$1,853.04" />
                <div className="mt-3">
                  <QRow label="24h change">
                    <span className="text-muted-foreground">—</span>
                  </QRow>
                  <QRow label="Earning" tone="up">
                    $605.23
                  </QRow>
                  <QRow label="Avg APY">
                    <span className="text-muted-foreground">—</span>
                  </QRow>
                </div>
                <StaleNote tone="muted">
                  Some metrics need price data · “—” means unavailable, not zero
                </StaleNote>
              </CardShell>
            </ReadCard>
          </div>
        </section>
      </main>
    </div>
  );
}

const MOCK_BALANCE = {
  available: 1247.81,
  savings: 605.23,
  total: 1853.04,
  holdings: [
    { symbol: "USDC", balance: 547.2, usdValue: 547.2 },
    { symbol: "SUI", balance: 142.5, usdValue: 600.21 },
    { symbol: "USDsui", balance: 100.4, usdValue: 100.4 },
    { symbol: "Manifest", balance: 1.4, usdValue: 0.12 },
    { symbol: "Lofi", balance: 5.21, usdValue: 0.08 },
    { symbol: "Deep", balance: 0.04, usdValue: 0.03 },
  ],
};

const MOCK_BALANCE_DEBT = {
  available: 1247.81,
  savings: 605.23,
  debt: 600,
  total: 1253.04,
  holdings: [
    { symbol: "USDC", balance: 547.2, usdValue: 547.2 },
    { symbol: "SUI", balance: 142.5, usdValue: 600.21 },
  ],
};

const MOCK_HEALTH_SAFE = {
  healthFactor: null,
  supplied: 1847,
  borrowed: 0,
};

const MOCK_HEALTH_WATCH = {
  healthFactor: 1.84,
  supplied: 1847,
  borrowed: 600,
  maxBorrow: 1015,
  liquidationThreshold: 0.8,
};

const MOCK_SAVINGS = {
  positions: [
    {
      symbol: "USDC",
      amount: 605.23,
      valueUsd: 605.23,
      apy: 0.0524,
      type: "supply" as const,
    },
  ],
  earnings: { currentApy: 0.0524, dailyEarning: 0.087, supplied: 605.23 },
};

const MOCK_SWAP = {
  fromToken: "SUI",
  toToken: "USDC",
  fromAmount: 50,
  toAmount: 209.62,
  priceImpact: 0.0018,
  route: "Cetus",
  slippage: 0.005,
};

const MOCK_PORTFOLIO = {
  totalValue: 1853.04,
  walletValue: 1247.81,
  savingsValue: 605.23,
  debtValue: 0,
  healthFactor: null,
  allocations: [
    { symbol: "USDC", amount: 547.2, usdValue: 1225, percentage: 66 },
    { symbol: "SUI", amount: 142.5, usdValue: 600, percentage: 32 },
    { symbol: "USDsui", amount: 28, usdValue: 28, percentage: 2 },
  ],
  stablePercentage: 68,
  insights: [] as { type: string; message: string }[],
  savingsApy: 0.0524,
  dailyEarning: 0.087,
  weekChange: { absoluteUsd: 24.18, percentChange: 1.32 },
};

const RX_SAVE = { tx: "Hp4o9zHHs", amount: 100, asset: "USDC", apy: 0.0524 };
const RX_WITHDRAW = { tx: "8kZq77m21", amount: 250, asset: "USDC" };
const RX_SEND = {
  tx: "Lp9w22Xc4",
  amount: 50,
  contactName: "alice@audric",
  to: "0xa4b2c0190000000000000000000000000000000000000000000000000000c019",
};
const RX_BORROW = { tx: "Rt3k99aF0", amount: 400, healthFactor: 2.31 };
const RX_REPAY = { tx: "Vy7m22dQ0", amount: 200, remainingDebt: 400 };
const RX_CLAIM = {
  tx: "Wq1x77bN0",
  rewards: [
    { symbol: "NAVX", amount: 28.4, estimatedValueUsd: 18.2 },
    { symbol: "SUI", amount: 4.12, estimatedValueUsd: 17.34 },
  ],
  totalValueUsd: 35.54,
};
const RX_HARVEST = {
  tx: "Hp4o9zHHs",
  claimed: [{ symbol: "NAVX", amount: 28.4, estimatedValueUsd: 42.1 }],
  swaps: [{ fromSymbol: "NAVX", inputAmount: 28.4, expectedOutputUsdc: 42.1 }],
  expectedUsdcDeposited: 42.1,
};
const RX_SWAP = {
  tx: "Zc8p44mR0",
  fromToken: "SUI",
  toToken: "USDC",
  fromAmount: 50,
  toAmount: 209.62,
  priceImpact: 0.18,
  route: "Cetus",
};

const MOCK_RATES = {
  USDC: { saveApy: 0.0524, borrowApy: 0.0712 },
  USDsui: { saveApy: 0.0611, borrowApy: 0.0834 },
};

const MOCK_YIELD = {
  today: 0.087,
  thisWeek: 0.61,
  thisMonth: 2.43,
  allTime: 18.92,
  currentApy: 0.0524,
  deposited: 505.23,
  projectedYear: 26.47,
  sparkline: [2, 3, 2.5, 4, 5, 4.5, 6, 7, 6.5, 8, 9, 11],
};

const MOCK_REWARDS = {
  rewards: [
    {
      protocol: "NAVI",
      asset: "NAVX",
      coinType: "0x1::navx::NAVX",
      symbol: "NAVX",
      amount: 28.4,
      estimatedValueUsd: 18.2,
    },
    {
      protocol: "NAVI",
      asset: "vSUI",
      coinType: "0x2::vsui::VSUI",
      symbol: "vSUI",
      amount: 4.12,
      estimatedValueUsd: 17.34,
    },
  ],
  totalValueUsd: 35.54,
  degraded: false,
  degradationReason: null,
};

const MOCK_REWARDS_EMPTY = {
  rewards: [],
  totalValueUsd: 0,
  degraded: false,
  degradationReason: null,
};

const MOCK_REWARDS_DEGRADED = {
  rewards: [],
  totalValueUsd: 0,
  degraded: true,
  degradationReason: "PROTOCOL_UNAVAILABLE",
};

const MOCK_PRICES = [
  { symbol: "SUI", price: 4.1924 },
  { symbol: "USDC", price: 1.0 },
  { symbol: "NAVX", price: 0.6408 },
  { symbol: "WAL", price: 0.0312 },
];

const MOCK_PRICE_CHANGE = {
  symbol: "SUI",
  currentPrice: 4.1924,
  change: 3.2,
  period: "24h",
};

const MOCK_ACTIVITY = {
  period: "month",
  totalTransactions: 28,
  byAction: [
    { action: "send", count: 11, totalAmountUsd: 1430.0 },
    { action: "swap", count: 8, totalAmountUsd: 920.5 },
    { action: "save", count: 6, totalAmountUsd: 1505.23 },
    { action: "receive", count: 3, totalAmountUsd: 600.0 },
  ],
  totalMovedUsd: 4455.73,
  netSavingsUsd: 905.23,
  yieldEarnedUsd: 2.43,
};

const MOCK_EXPLAIN = {
  digest: "Hp4o9zHHsQwertY1234567890abcdefABCDEF",
  sender: "0xa4b2…c019",
  status: "Success",
  gasUsed: "0.0021 SUI",
  timestamp: new Date(Date.now() - 3_600_000).toISOString(),
  effects: [
    { type: "send", description: "0xa4b2…c019 sent 50.00 USDC" },
    { type: "receive", description: "0x7a3b…f29c received 50.00 USDC" },
  ],
  summary:
    "Sent 50.00 USDC to 0x7a3b…f29c. Settled in one transaction, gasless.",
};

const MOCK_LINK_CREATED = {
  slug: "zhLwHZ7A",
  url: "https://audric.ai/pay/zhLwHZ7A",
  amount: 5,
  currency: "USDC",
  label: "Americano coffee",
  memo: null,
  expiresAt: null,
};

const MOCK_LINK_LIST = {
  links: [
    {
      slug: "pG2yXXwL",
      url: "https://audric.ai/pay/pG2yXXwL",
      amount: 3,
      currency: "USDC",
      label: "Americano coffee",
      status: "active",
      paidAt: null,
      createdAt: "2026-05-28T10:00:00Z",
    },
    {
      slug: "5vy6xhwY",
      url: "https://audric.ai/pay/5vy6xhwY",
      amount: 200,
      currency: "USDC",
      label: "Design work",
      status: "cancelled",
      paidAt: null,
      createdAt: "2026-05-23T10:00:00Z",
    },
    {
      slug: "jW7dwEun",
      url: "https://audric.ai/pay/jW7dwEun",
      amount: 1,
      currency: "USDC",
      label: null,
      status: "paid",
      paidAt: "2026-05-23T12:00:00Z",
      createdAt: "2026-05-23T10:00:00Z",
    },
  ],
};

const MOCK_HISTORY = {
  count: 12,
  transactions: [
    {
      digest: "tx1",
      action: "send",
      label: "Sent to alice@audric",
      amount: 50,
      asset: "USDC",
      recipient: "0xa4b2c019",
      direction: "out" as const,
      timestamp: Date.now() - 120_000,
    },
    {
      digest: "tx2",
      action: "save",
      label: "Saved to NAVI",
      amount: 100,
      asset: "USDC",
      direction: "out" as const,
      timestamp: Date.now() - 480_000,
    },
    {
      digest: "tx3",
      action: "swap",
      label: "Swapped SUI → USDC",
      amount: 45.51,
      asset: "USDC",
      direction: "in" as const,
      timestamp: Date.now() - 3_600_000,
    },
    {
      digest: "tx4",
      action: "receive",
      label: "Received from sam@audric",
      amount: 200,
      asset: "USDC",
      recipient: "0x7a3bf29c",
      direction: "in" as const,
      timestamp: Date.now() - 86_400_000 - 3_600_000,
    },
    {
      digest: "tx5",
      action: "save",
      label: "Saved to NAVI",
      amount: 505.23,
      asset: "USDC",
      direction: "out" as const,
      timestamp: Date.now() - 3 * 86_400_000,
    },
  ],
};

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-[4px] border px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] transition-colors",
        active
          ? "border-border bg-background text-foreground"
          : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Section({
  label,
  note,
  cols = 4,
  children,
}: {
  children: ReactNode;
  cols?: 2 | 4;
  label: string;
  note: string;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
        {"// "}
        {label}
        <span className="ml-2 text-foreground/60 normal-case tracking-[0.01em]">
          {note}
        </span>
      </span>
      <div
        className={cn(
          "grid gap-3.5",
          cols === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-2 sm:grid-cols-4"
        )}
      >
        {children}
      </div>
    </section>
  );
}

function PermissionState({
  label,
  children,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
        {"// "}
        {label}
      </span>
      {children}
    </div>
  );
}

function ReadCard({ label, children }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
        {"// "}
        {label}
      </span>
      {children}
    </div>
  );
}

function Swatch({
  children,
  center,
}: {
  center?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[140px] flex-col gap-3.5 rounded-[10px] border border-border bg-card p-5",
        center ? "items-center justify-center" : "justify-center"
      )}
    >
      {children}
    </div>
  );
}
