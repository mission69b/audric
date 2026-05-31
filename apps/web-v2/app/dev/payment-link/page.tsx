"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { PaymentLinkCard } from "@/components/audric/cards/PaymentLinkCard";
import { cn } from "@/lib/utils";

/**
 * Dev-only harness for R6.6 6b — the PaymentLinkCard chat renderer
 * (`t2000-AFI/audric/phase2-payment-link.html`, states A created-unlabelled ·
 * B created-labelled · C list with all status badges). Gated to non-production.
 */

const CREATED_UNLABELLED = {
  slug: "zhLwHZ7A",
  url: "https://audric.ai/pay/zhLwHZ7A",
  amount: 5,
  currency: "USDC",
  label: null,
  memo: null,
  expiresAt: null,
};

const CREATED_LABELLED = {
  slug: "pG2yXXwL",
  url: "https://audric.ai/pay/pG2yXXwL",
  amount: 3,
  currency: "USDC",
  label: "Americano coffee",
  memo: null,
  expiresAt: null,
};

const LIST = {
  links: [
    {
      slug: "pG2yXXwL",
      url: "https://audric.ai/pay/pG2yXXwL",
      amount: 3,
      currency: "USDC",
      label: "Americano coffee",
      status: "active",
      paidAt: null,
      createdAt: "2026-05-28T09:30:00.000Z",
    },
    {
      slug: "zhLwHZ7A",
      url: "https://audric.ai/pay/zhLwHZ7A",
      amount: 5,
      currency: "USDC",
      label: null,
      status: "active",
      paidAt: null,
      createdAt: "2026-05-28T09:30:00.000Z",
    },
    {
      slug: "5vy6xhwY",
      url: "https://audric.ai/pay/5vy6xhwY",
      amount: 200,
      currency: "USDC",
      label: "Design work",
      status: "cancelled",
      paidAt: null,
      createdAt: "2026-05-23T09:30:00.000Z",
    },
    {
      slug: "jW7dwEun",
      url: "https://audric.ai/pay/jW7dwEun",
      amount: 1,
      currency: "USDC",
      label: null,
      status: "paid",
      paidAt: "2026-05-23T10:00:00.000Z",
      createdAt: "2026-05-23T09:30:00.000Z",
    },
  ],
};

export default function PaymentLinkHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Payment link card harness
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-payment-link.html"}
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

      <main className="mx-auto flex max-w-[420px] flex-col gap-12 px-6 py-12">
        <Section label="// A · CREATED (unlabelled)">
          <PaymentLinkCard data={CREATED_UNLABELLED} />
        </Section>
        <Section label="// B · CREATED (labelled)">
          <PaymentLinkCard data={CREATED_LABELLED} />
        </Section>
        <Section label="// C · LIST (active + paid + cancelled)">
          <PaymentLinkCard data={LIST} />
        </Section>
      </main>
    </div>
  );
}

function Section({
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
      {children}
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
