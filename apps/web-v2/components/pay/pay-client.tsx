"use client";

/**
 * PayClient — the public `/pay/[slug]` receipt screen. The only signed-out
 * application surface, so the visuals lean on the QR-receipt pattern:
 * serif amount, mono eyebrows, light card shell, pulsing "Listening for
 * payment" status indicator.
 *
 * Ported verbatim from `apps/web/components/pay/PayClient.tsx` for
 * Session 4 (v0.7c Phase 6). Behaviour preservation:
 *   - All hooks (state machine + 6s poll + wallet-success retry-with-backoff)
 *     preserved exactly.
 *   - Same fetch URLs against same-origin `/api/payments/${slug}` and
 *     `/api/payments/${slug}/verify`.
 *   - Sub-components consumed with the same props.
 */

import { useCallback, useEffect, useState } from "react";
import { AudricMark } from "@/components/ui/audric-mark";
import { DigestForm } from "./digest-form";
import { PayButton } from "./pay-button";
import { SuiPayQr } from "./sui-pay-qr";

// [V07E_INVOICE_DEPRECATION / S.269 item 7 — 2026-05-23] Pre-deprecation
// the data shape included `lineItems`, `dueDate`, `billToEmail`,
// `billToName`, `senderName`, and a `type: "link" | "invoice"` discriminator
// that branched the render between PaymentLink and InvoiceHeader. Phase
// 3 of the deprecation collapses both branches into the payment-link
// render path — invoices in the DB pre-Phase-5 (until the migration drops
// them) render as payment links with no line items / no due date
// (graceful degradation; their slug URLs keep working). The `type` field
// is preserved on the wire for one transition cycle so /api/payments
// keeps shipping it; UI ignores it and always renders the link path.
export interface PaymentData {
  amount: number | null;
  createdAt: string;
  currency: string;
  expiresAt?: string | null;
  label: string | null;
  memo: string | null;
  nonce: string;
  paidAt: string | null;
  paidBy: string | null;
  paymentMethod: string | null;
  recipientAddress: string;
  recipientName: string | null;
  slug: string;
  status: string;
  txDigest: string | null;
}

type PageState =
  | "loading"
  | "active"
  | "paid"
  | "expired"
  | "overdue"
  | "cancelled"
  | "not_found";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PayClient({ slug }: { slug: string }) {
  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<PaymentData | null>(null);
  const [copied, setCopied] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyStatus = useCallback((payment: PaymentData) => {
    const s = payment.status;
    if (s === "paid") {
      setState("paid");
    } else if (s === "expired") {
      setState("expired");
    } else if (s === "overdue") {
      setState("overdue");
    } else if (s === "cancelled") {
      setState("cancelled");
    } else {
      setState("active");
    }
    setData(payment);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/payments/${slug}`);
        if (!res.ok) {
          setState("not_found");
          return;
        }
        const payment = (await res.json()) as PaymentData;
        applyStatus(payment);
      } catch {
        setState("not_found");
      }
    };
    load().catch(() => setState("not_found"));
  }, [slug, applyStatus]);

  useEffect(() => {
    if (state !== "active" && state !== "overdue") {
      return;
    }
    let stopped = false;

    const poll = async () => {
      if (stopped) {
        return;
      }
      setDetecting(true);
      try {
        const res = await fetch(`/api/payments/${slug}/verify`, {
          method: "POST",
        });
        if (!res.ok) {
          return;
        }
        const result = (await res.json()) as {
          status: string;
          paidAt: string | null;
          txDigest?: string;
          amountReceived?: number;
        };
        if (result.status === "paid") {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  status: "paid",
                  paidAt: result.paidAt,
                  txDigest: result.txDigest ?? null,
                }
              : prev
          );
          setState("paid");
          stopped = true;
        }
      } catch {
        /* silent */
      } finally {
        setDetecting(false);
      }
    };

    const interval = setInterval(() => {
      poll().catch(() => {
        /* silent */
      });
    }, 6000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [state, slug]);

  const copyAddress = useCallback(() => {
    if (!data) {
      return;
    }
    navigator.clipboard.writeText(data.recipientAddress).catch(() => {
      /* clipboard not available — silent */
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const handleWalletSuccess = useCallback(
    async (digest: string, sender: string) => {
      const verify = async (): Promise<{
        status: string;
        paidAt?: string;
        txDigest?: string;
        error?: string;
      }> => {
        const res = await fetch(`/api/payments/${slug}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            digest,
            paymentMethod: "wallet_connect",
          }),
        });
        return res.json();
      };

      const delays = [2000, 3000, 5000];
      for (let i = 0; i <= delays.length; i++) {
        if (i > 0) {
          await new Promise((r) => setTimeout(r, delays[i - 1]));
        }
        try {
          const result = await verify();
          if (result.status === "paid") {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    status: "paid",
                    paidAt: result.paidAt ?? new Date().toISOString(),
                    paidBy: sender,
                    txDigest: digest,
                    paymentMethod: "wallet_connect",
                  }
                : prev
            );
            setState("paid");
            return;
          }
          if (i === delays.length) {
            setError(
              result.error ??
                "Verification failed — the transaction was sent but could not be confirmed. Please submit the digest manually."
            );
          }
        } catch {
          if (i === delays.length) {
            setError(
              "Transaction sent, verifying... Please submit the digest manually if this persists."
            );
          }
        }
      }
    },
    [slug]
  );

  const handleDigestSuccess = useCallback((digest: string) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            status: "paid",
            paidAt: new Date().toISOString(),
            txDigest: digest,
            paymentMethod: "manual",
          }
        : prev
    );
    setState("paid");
    setError(null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* page-nav — standalone public chrome (brand + canonical url) */}
      <header className="flex h-[52px] items-center gap-2 border-border border-b px-[18px]">
        <a
          aria-label="Audric"
          className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
          href="https://audric.ai"
          rel="noopener noreferrer"
          target="_blank"
        >
          <AudricMark size={18} />
          <span className="font-sans font-semibold text-[14px] tracking-[-0.022em]">
            audric
          </span>
        </a>
        <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">
          audric.ai/pay/{slug}
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[340px]">
          {state === "loading" && <LoadingState />}

          {(state === "active" || state === "overdue") && data && (
            <ActivePayment
              copied={copied}
              data={data}
              detecting={detecting}
              error={error}
              onCopy={copyAddress}
              onDigestSuccess={handleDigestSuccess}
              onError={setError}
              onWalletSuccess={handleWalletSuccess}
            />
          )}

          {state === "paid" && data && <PaidState data={data} />}
          {state === "expired" && <ExpiredState />}
          {state === "cancelled" && <CancelledState />}
          {state === "not_found" && <NotFoundState />}
        </div>
      </main>
    </div>
  );
}

const SECONDARY_BTN =
  "inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-4 font-medium font-sans text-[13px] text-foreground tracking-[-0.011em] transition hover:bg-accent focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none";

interface ActivePaymentProps {
  copied: boolean;
  data: PaymentData;
  detecting: boolean;
  error: string | null;
  onCopy: () => void;
  onDigestSuccess: (digest: string) => void;
  onError: (error: string) => void;
  onWalletSuccess: (digest: string, sender: string) => void;
}

export function ActivePayment({
  data,
  copied,
  onCopy,
  detecting,
  error,
  onWalletSuccess,
  onDigestSuccess,
  onError,
}: ActivePaymentProps) {
  const shortAddr = `${data.recipientAddress.slice(0, 6)}…${data.recipientAddress.slice(-4)}`;
  const requester = data.recipientName ?? shortAddr;

  return (
    <div className="flex flex-col items-center gap-[18px] text-center">
      {/* PA1 — requester + amount hero */}
      <div className="flex flex-col items-center gap-2">
        <span className="size-11 rounded-full border border-border bg-gradient-to-br from-muted-foreground to-foreground" />
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          <strong className="font-medium text-foreground">{requester}</strong>{" "}
          requests
        </span>
      </div>

      <div className="font-medium font-sans text-[48px] text-foreground leading-none tracking-[-0.04em] tabular-nums">
        {fmtUsd(data.amount ?? 0)}
        <span className="ml-1.5 font-medium text-[22px] text-muted-foreground">
          {data.currency}
        </span>
      </div>

      {data.label && (
        <div className="text-[14px] text-muted-foreground">{data.label}</div>
      )}

      {error && (
        <div className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left font-mono text-[10px] text-destructive">
          {error}
        </div>
      )}

      <div className="w-full">
        <PayButton
          amount={data.amount}
          nonce={data.nonce}
          onError={onError}
          onSuccess={onWalletSuccess}
          recipientAddress={data.recipientAddress}
          slug={data.slug}
        />
      </div>

      {/* PA6 — scan-to-pay QR */}
      <div className="flex w-full flex-col items-center gap-2 border-border border-t pt-[18px]">
        <SuiPayQr
          amount={data.amount}
          label={data.label}
          memo={data.memo}
          nonce={data.nonce}
          recipientAddress={data.recipientAddress}
          size={144}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          Scan with any Sui wallet to pay
        </span>
      </div>

      {/* secondary affordances — copy address + PA5 digest fallback */}
      <div className="flex w-full flex-col gap-2">
        <button
          className={`w-full ${SECONDARY_BTN}`}
          onClick={onCopy}
          type="button"
        >
          {copied ? "Copied!" : "Copy address"}
        </button>
        <DigestForm
          onError={onError}
          onSuccess={onDigestSuccess}
          slug={data.slug}
        />
      </div>

      {/* footer — gasless reassurance + live listening dot */}
      <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground tracking-[0.04em]">
        <span
          className={`size-1 rounded-full bg-signal ${detecting ? "animate-pulse" : ""}`}
        />
        {detecting
          ? "Checking for payment…"
          : "Gasless · settles in ~0.4s on Sui"}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex animate-pulse flex-col items-center gap-[18px]">
      <div className="size-11 rounded-full bg-muted" />
      <div className="h-10 w-40 rounded bg-muted" />
      <div className="h-[46px] w-full rounded-lg bg-muted" />
      <div className="size-[144px] rounded-lg bg-muted" />
    </div>
  );
}

export function PaidState({ data }: { data: PaymentData }) {
  const txUrl = data.txDigest
    ? `https://suiscan.xyz/mainnet/tx/${data.txDigest}`
    : null;
  const shortDigest = data.txDigest
    ? `${data.txDigest.slice(0, 6)}…${data.txDigest.slice(-3)}`
    : null;
  const shortAddr = `${data.recipientAddress.slice(0, 6)}…${data.recipientAddress.slice(-4)}`;
  const requester = data.recipientName ?? shortAddr;

  return (
    <div className="flex flex-col items-center gap-[18px] text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-signal text-background">
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          viewBox="0 0 16 16"
          width="22"
        >
          <title>Paid</title>
          <path
            d="M3.5 8.5L6.5 11.5L13 4.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </span>
      <div>
        <div className="font-medium font-sans text-[18px] text-foreground tracking-[-0.018em]">
          Paid {data.amount == null ? "" : `${fmtUsd(data.amount)} `}
          {data.currency}
        </div>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          to {requester}
          {data.label ? ` · ${data.label}` : ""}
        </p>
      </div>
      {data.paidAt && (
        <div className="font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
          {`Paid ${new Date(data.paidAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}`}
          {shortDigest ? ` · ${shortDigest}` : ""}
        </div>
      )}
      {txUrl && (
        <a
          className={SECONDARY_BTN}
          href={txUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          View on Sui ↗
        </a>
      )}
      <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground tracking-[0.04em]">
        <span className="size-1 rounded-full bg-signal" />
        Receipt sent to your wallet
      </div>
    </div>
  );
}

export function ExpiredState() {
  return (
    <EndState
      subtitle="This payment link is no longer active. Please request a new one from the recipient."
      title="Payment link expired"
    />
  );
}

export function CancelledState() {
  return (
    <EndState
      subtitle="This payment link was cancelled by the recipient. Please request a new one."
      title="Payment link cancelled"
    />
  );
}

function EndState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="font-medium text-[16px] tracking-[-0.014em]">{title}</div>
      <p className="max-w-[280px] text-[13px] text-muted-foreground">
        {subtitle}
      </p>
      <a
        className={`mt-1 ${SECONDARY_BTN}`}
        href="https://audric.ai"
        rel="noopener noreferrer"
        target="_blank"
      >
        Go to audric.ai
      </a>
    </div>
  );
}

export function NotFoundState() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="font-sans font-semibold text-[64px] leading-none tracking-[-0.04em]">
        4<span className="text-muted-foreground">0</span>4
      </div>
      <div className="font-medium text-[16px] tracking-[-0.014em]">
        Payment link not found
      </div>
      <p className="max-w-[280px] text-[13px] text-muted-foreground">
        This link expired, was cancelled, or never existed.
      </p>
      <a
        className={`mt-1 ${SECONDARY_BTN}`}
        href="https://audric.ai"
        rel="noopener noreferrer"
        target="_blank"
      >
        Go to audric.ai
      </a>
    </div>
  );
}
