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
import { InvoiceHeader } from "./invoice-header";
import { PayButton } from "./pay-button";
import { SuiPayQr } from "./sui-pay-qr";

interface LineItem {
  amount: number;
  description: string;
  quantity?: number;
}

interface PaymentData {
  amount: number | null;
  billToEmail?: string | null;
  billToName?: string | null;
  createdAt: string;
  currency: string;
  dueDate?: string | null;
  expiresAt?: string | null;
  label: string | null;
  lineItems?: LineItem[] | null;
  memo: string | null;
  nonce: string;
  paidAt: string | null;
  paidBy: string | null;
  paymentMethod: string | null;
  recipientAddress: string;
  recipientName: string | null;
  senderName?: string | null;
  slug: string;
  status: string;
  txDigest: string | null;
  type: "link" | "invoice";
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

  const isInvoice = data?.type === "invoice";
  const headerLabel = isInvoice ? "Invoice" : "Audric Pay";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-page px-4 py-8 text-fg-primary">
      <div className={`w-full ${isInvoice ? "max-w-md" : "max-w-sm"}`}>
        <div className="mb-8 flex items-center justify-center gap-2">
          <AudricMark size={20} />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
            {headerLabel}
          </span>
        </div>

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
            overdue={state === "overdue"}
          />
        )}

        {state === "paid" && data && <PaidState data={data} />}
        {state === "expired" && <ExpiredState />}
        {state === "cancelled" && <CancelledState isInvoice={isInvoice} />}
        {state === "not_found" && <NotFoundState />}

        <div className="mt-8 text-center">
          <a
            className="font-mono text-[10px] tracking-[0.08em] text-fg-muted transition hover:text-fg-primary"
            href="https://audric.ai"
            rel="noopener noreferrer"
            target="_blank"
          >
            Powered by Audric — Your money, handled. →
          </a>
        </div>
      </div>
    </div>
  );
}

interface ActivePaymentProps {
  copied: boolean;
  data: PaymentData;
  detecting: boolean;
  error: string | null;
  onCopy: () => void;
  onDigestSuccess: (digest: string) => void;
  onError: (error: string) => void;
  onWalletSuccess: (digest: string, sender: string) => void;
  overdue: boolean;
}

function ActivePayment({
  data,
  overdue,
  copied,
  onCopy,
  detecting,
  error,
  onWalletSuccess,
  onDigestSuccess,
  onError,
}: ActivePaymentProps) {
  const isInvoice = data.type === "invoice";
  const shortAddr = `${data.recipientAddress.slice(0, 8)}...${data.recipientAddress.slice(-6)}`;

  return (
    <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-card shadow-[var(--shadow-flat)]">
      <div className="px-6 pt-6 pb-4">
        {isInvoice ? (
          <InvoiceHeader
            amount={data.amount ?? 0}
            createdAt={data.createdAt}
            currency={data.currency}
            dueDate={data.dueDate ?? null}
            label={data.label ?? "Invoice"}
            lineItems={
              (data.lineItems ?? []) as {
                description: string;
                amount: number;
                quantity?: number;
              }[]
            }
            overdue={overdue}
            recipientEmail={data.billToEmail ?? null}
            recipientName={data.billToName ?? null}
            senderName={data.recipientName}
          />
        ) : (
          <div className="text-center">
            {data.label && (
              <div className="mb-1 text-[13px] text-fg-secondary">
                {data.label}
              </div>
            )}
            <div className="font-serif text-[40px] leading-none tracking-[-0.02em] text-fg-primary">
              ${fmtUsd(data.amount ?? 0)}
            </div>
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
              {data.currency}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center py-4">
        <SuiPayQr
          amount={data.amount}
          label={data.label}
          memo={data.memo}
          nonce={data.nonce}
          recipientAddress={data.recipientAddress}
          size={isInvoice ? 140 : 180}
        />
      </div>

      <div className="space-y-2 px-6 py-3">
        {!isInvoice && (
          <>
            <DetailRow label="To" value={data.recipientName ?? shortAddr} />
            {data.recipientName && (
              <DetailRow label="Address" value={shortAddr} />
            )}
            {data.memo && <DetailRow label="Memo" value={data.memo} />}
            {data.expiresAt && (
              <DetailRow
                label="Expires"
                value={new Date(data.expiresAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              />
            )}
          </>
        )}

        {isInvoice && <DetailRow label="Pay to" value={shortAddr} />}
        {data.memo && isInvoice && <DetailRow label="Note" value={data.memo} />}
      </div>

      {error && (
        <div className="px-6 pb-2">
          <div className="rounded-xs border border-error-border bg-error-bg px-3 py-2 font-mono text-[10px] text-error-fg">
            {error}
          </div>
        </div>
      )}

      <div className="space-y-2 px-6 pb-6">
        <PayButton
          amount={data.amount}
          nonce={data.nonce}
          onError={onError}
          onSuccess={onWalletSuccess}
          recipientAddress={data.recipientAddress}
          slug={data.slug}
        />

        <button
          className="h-10 w-full rounded-pill border border-border-strong bg-transparent font-mono text-[11px] uppercase tracking-[0.06em] text-fg-primary transition hover:bg-surface-sunken focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          onClick={onCopy}
          type="button"
        >
          {copied ? "Copied!" : "Copy Address"}
        </button>

        <DigestForm
          onError={onError}
          onSuccess={onDigestSuccess}
          slug={data.slug}
        />

        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              detecting ? "animate-pulse bg-success-solid" : "bg-border-subtle"
            }`}
          />
          <span className="font-mono text-[10px] tracking-[0.06em] text-fg-muted">
            {detecting ? "Checking for payment..." : "Listening for payment"}
          </span>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between font-mono text-[11px]">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg-primary">{value}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
      <div className="animate-pulse space-y-4">
        <div className="mx-auto h-40 w-40 rounded-md bg-surface-sunken" />
        <div className="mx-auto h-4 w-3/4 rounded bg-surface-sunken" />
        <div className="mx-auto h-4 w-1/2 rounded bg-surface-sunken" />
      </div>
    </div>
  );
}

function PaidState({ data }: { data: PaymentData }) {
  const txUrl = data.txDigest
    ? `https://suiscan.xyz/mainnet/tx/${data.txDigest}`
    : null;
  const shortDigest = data.txDigest
    ? `${data.txDigest.slice(0, 8)}...${data.txDigest.slice(-6)}`
    : null;
  const isInvoice = data.type === "invoice";

  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center shadow-[var(--shadow-flat)]">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-success-border bg-success-bg">
        <svg
          aria-hidden="true"
          className="text-success-solid"
          fill="none"
          height="24"
          viewBox="0 0 24 24"
          width="24"
        >
          <title>Paid</title>
          <path
            d="M20 6L9 17L4 12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </div>
      <h2 className="mb-1 font-serif text-[20px] tracking-[-0.01em] text-fg-primary">
        {isInvoice ? "Invoice Paid" : "Payment Complete"}
      </h2>
      {data.amount != null && (
        <div className="mb-1 font-serif text-[28px] leading-tight tracking-[-0.02em] text-fg-primary">
          ${fmtUsd(data.amount)}
        </div>
      )}
      {isInvoice && data.label && (
        <p className="mb-2 font-mono text-[10px] text-fg-muted">{data.label}</p>
      )}
      {data.paymentMethod && (
        <span className="mb-3 inline-block rounded-xs border border-success-border bg-success-bg px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-success-fg">
          {data.paymentMethod === "wallet_connect"
            ? "Wallet"
            : data.paymentMethod === "manual"
              ? "Manual"
              : data.paymentMethod}
        </span>
      )}
      <p className="mb-4 text-[13px] text-fg-secondary">
        {data.paidAt
          ? `Paid ${new Date(data.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
          : "This payment has been completed."}
      </p>
      {txUrl && shortDigest && (
        <a
          className="font-mono text-[11px] text-info-fg transition hover:opacity-70"
          href={txUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {shortDigest} ↗
        </a>
      )}
    </div>
  );
}

function ExpiredState() {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-warning-border bg-warning-bg">
        <svg
          aria-hidden="true"
          className="text-warning-solid"
          fill="none"
          height="24"
          viewBox="0 0 24 24"
          width="24"
        >
          <title>Expired</title>
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M12 8V12L14 14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </div>
      <h2 className="mb-1 font-serif text-[20px] tracking-[-0.01em] text-fg-primary">
        Expired
      </h2>
      <p className="text-[13px] text-fg-secondary">
        This payment link is no longer active. Please request a new one from the
        recipient.
      </p>
    </div>
  );
}

function CancelledState({ isInvoice }: { isInvoice: boolean }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-sunken">
        <svg
          aria-hidden="true"
          className="text-fg-muted"
          fill="none"
          height="24"
          viewBox="0 0 24 24"
          width="24"
        >
          <title>Cancelled</title>
          <path
            d="M18 6L6 18M6 6L18 18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </div>
      <h2 className="mb-1 font-serif text-[20px] tracking-[-0.01em] text-fg-primary">
        {isInvoice ? "Invoice Cancelled" : "Link Cancelled"}
      </h2>
      <p className="text-[13px] text-fg-secondary">
        {isInvoice
          ? "This invoice has been cancelled by the sender."
          : "This payment link has been cancelled by the recipient. Please request a new one."}
      </p>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-sunken">
        <svg
          aria-hidden="true"
          className="text-fg-muted"
          fill="none"
          height="24"
          viewBox="0 0 24 24"
          width="24"
        >
          <title>Not found</title>
          <path
            d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </div>
      <h2 className="mb-1 font-serif text-[20px] tracking-[-0.01em] text-fg-primary">
        Not Found
      </h2>
      <p className="text-[13px] text-fg-secondary">
        This payment doesn&apos;t exist or has been removed.
      </p>
    </div>
  );
}
