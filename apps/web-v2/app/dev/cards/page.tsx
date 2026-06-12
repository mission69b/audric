"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { type ReactNode, useState } from "react";

import { BundleReceiptCard } from "@/components/audric/cards/BundleReceiptCard";
import { ConfirmationChip } from "@/components/audric/cards/ConfirmationChip";
import {
  CardShell,
  QRow,
  StaleNote,
} from "@/components/audric/cards/primitives";
import { SkeletonCard } from "@/components/audric/cards/SkeletonCard";
import { SwapQuoteCardV2 } from "@/components/audric/cards/SwapQuoteCardV2";
import {
  AddressBlock,
  AssetAmountBlock,
  CardState,
  MetricBlock,
  RouteDiagram,
  StatusBlock,
} from "@/components/audric/cards/shared";
import { TransactionReceiptCard } from "@/components/audric/cards/TransactionReceiptCard";
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
                description="Withdraw 0.73 USDC from NAVI savings to your wallet."
                input={{ amount: 0.73, asset: "USDC" }}
                modifiableFields={[]}
                onApprove={noop}
                onDeny={noop}
                toolName="withdraw"
              />
            </PermissionState>

            <PermissionState label="02 EDITABLE — amount user-tunable">
              <PermissionCard
                denyTimeoutSec={3600}
                description="Withdraw USDC from NAVI savings. Edit the amount before approving."
                input={{ amount: 50, asset: "USDC" }}
                modifiableFields={[
                  { name: "amount", kind: "amount", asset: "USDC" },
                ]}
                onApprove={noop}
                onDeny={noop}
                toolName="withdraw"
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
                description="Withdraw 0.73 USDC from NAVI savings to your wallet."
                input={{ amount: 0.73, asset: "USDC" }}
                modifiableFields={[]}
                onApprove={noResolve}
                onDeny={noop}
                toolName="withdraw"
              />
            </PermissionState>
          </div>
        </section>

        <section className="flex flex-col gap-3.5">
          <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            {"// 8 · Read cards"}
            <span className="ml-2 text-foreground/60 normal-case tracking-[0.01em]">
              {"swap-quote is the lone survivor (§2d grace window)"}
            </span>
          </span>
          <div
            className={cn(
              "grid gap-4",
              narrow ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            )}
          >
            <ReadCard label="Swap — read-only quote">
              <SwapQuoteCardV2 data={MOCK_SWAP} />
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
            <ReadCard label="P2 withdraw">
              <TransactionReceiptCard data={RX_WITHDRAW} toolName="withdraw" />
            </ReadCard>
            <ReadCard label="P3 send">
              <TransactionReceiptCard data={RX_SEND} toolName="send_transfer" />
            </ReadCard>
            <ReadCard label="P5 repay">
              <TransactionReceiptCard data={RX_REPAY} toolName="repay_debt" />
            </ReadCard>
            <ReadCard label="P8 swap">
              <TransactionReceiptCard data={RX_SWAP} toolName="swap_execute" />
            </ReadCard>
            <ReadCard label="P9 bundle — multi-op Payment Intent">
              <BundleReceiptCard
                digest="0x97pH4o2c9d1e8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4M3Y"
                steps={[
                  {
                    toolName: "swap_execute",
                    input: { from: "WAL", to: "SUI", amount: 12.34 },
                  },
                  {
                    toolName: "swap_execute",
                    input: { from: "vSUI", to: "SUI", amount: 0.44 },
                  },
                  {
                    toolName: "swap_execute",
                    input: { from: "NAVX", to: "SUI", amount: 10.26 },
                  },
                  {
                    toolName: "swap_execute",
                    input: { from: "USDT", to: "SUI", amount: 0.01 },
                  },
                ]}
              />
            </ReadCard>
          </div>

          <span className="mt-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            {"// D1\u2013D8 · ConfirmationChip denial pills"}
          </span>
          <div className="flex flex-wrap gap-2.5 rounded-[10px] border border-border border-dashed bg-card p-[18px]">
            {[
              "TRANSFER CANCELLED",
              "WITHDRAW CANCELLED",
              "SWAP CANCELLED",
              "REPAY CANCELLED",
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

const MOCK_SWAP = {
  fromToken: "SUI",
  toToken: "USDC",
  fromAmount: 50,
  toAmount: 209.62,
  priceImpact: 0.0018,
  route: "Cetus",
  slippage: 0.005,
};

const RX_WITHDRAW = { tx: "8kZq77m21", amount: 250, asset: "USDC" };
const RX_SEND = {
  tx: "Lp9w22Xc4",
  amount: 50,
  contactName: "alice@audric",
  to: "0xa4b2c0190000000000000000000000000000000000000000000000000000c019",
};
const RX_REPAY = { tx: "Vy7m22dQ0", amount: 200, remainingDebt: 400 };
const RX_SWAP = {
  tx: "Zc8p44mR0",
  fromToken: "SUI",
  toToken: "USDC",
  fromAmount: 50,
  toAmount: 209.62,
  priceImpact: 0.18,
  route: "Cetus",
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
