"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  ActivePayment,
  CancelledState,
  ExpiredState,
  NotFoundState,
  PaidState,
  type PaymentData,
} from "@/components/pay/pay-client";
import { AudricMark } from "@/components/ui/audric-mark";
import { cn } from "@/lib/utils";

/**
 * Dev-only harness for R6.6 6a — the public `/pay/[slug]` surface
 * (`t2000-AFI/audric/phase2-pay-public.html`, states PA1 active · PA2 404 ·
 * PA4 success · PA5 digest · PA6 QR). The real `PayClient` is fetch-driven,
 * so the harness renders the exported presentational states directly with
 * mock data inside the same standalone page chrome. Gated to non-production.
 */

const MOCK_ADDRESS =
  "0xe1c0e0a3d2e5d22c5d4c4e63b53f86d9a8e7f17700000000000000000000f177";

const BASE: PaymentData = {
  amount: 5,
  createdAt: "2026-05-28T09:30:00.000Z",
  currency: "USDC",
  expiresAt: null,
  label: "Americano coffee",
  memo: null,
  nonce: "mock-nonce-zhLwHZ7A",
  paidAt: "2026-05-28T09:31:00.000Z",
  paidBy: null,
  paymentMethod: "wallet_connect",
  recipientAddress: MOCK_ADDRESS,
  recipientName: "funkii@audric",
  slug: "zhLwHZ7A",
  status: "active",
  txDigest: "Lp9wHHsabc1234567890defXc4",
};

export default function PayHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Client-only render: the states embed locale/timezone-formatted dates
  // (PaidState), which would mismatch between the UTC SSR pass and the
  // client's local TZ. The real PayClient only reveals these states
  // post-mount (after the fetch), so gating the harness the same way keeps
  // it hydration-clean.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Pay public harness
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-pay-public.html"}
        </span>
        <div className="ml-auto flex items-center gap-2">
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

      <main className="mx-auto grid max-w-[1080px] grid-cols-1 gap-6 px-6 py-12 md:grid-cols-2">
        <Cell label="// PA1 ACTIVE · wallet + QR + digest">
          <ActivePayment
            copied={false}
            data={BASE}
            detecting={false}
            error={null}
            onCopy={() => undefined}
            onDigestSuccess={() => undefined}
            onError={() => undefined}
            onWalletSuccess={() => undefined}
          />
        </Cell>

        <Cell label="// PA4 SUCCESS · receipt">
          <PaidState data={{ ...BASE, status: "paid" }} />
        </Cell>

        <Cell label="// PA2 NOT FOUND · invalid slug">
          <NotFoundState />
        </Cell>

        <Cell label="// EXPIRED">
          <ExpiredState />
        </Cell>

        <Cell label="// CANCELLED">
          <CancelledState />
        </Cell>

        <Cell label="// ACTIVE · open amount + detecting">
          <ActivePayment
            copied={true}
            data={{
              ...BASE,
              amount: 12.5,
              label: "Design work",
              recipientName: "sam@audric",
            }}
            detecting={true}
            error={null}
            onCopy={() => undefined}
            onDigestSuccess={() => undefined}
            onError={() => undefined}
            onWalletSuccess={() => undefined}
          />
        </Cell>
      </main>
    </div>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </p>
      {/* simulated standalone page frame */}
      <div className="flex min-h-[440px] flex-col overflow-hidden rounded-xl border border-border">
        <div className="flex h-[52px] items-center gap-2 border-border border-b px-[18px]">
          <span className="inline-flex items-center gap-2">
            <AudricMark size={18} />
            <span className="font-sans font-semibold text-[14px] tracking-[-0.022em]">
              audric
            </span>
          </span>
          <span className="ml-auto font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">
            audric.ai/pay/zhLwHZ7A
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="w-full max-w-[340px]">{children}</div>
        </div>
      </div>
    </div>
  );
}

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
        "rounded-md border px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] transition-colors",
        active
          ? "border-border bg-card text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
