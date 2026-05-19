"use client";

/**
 * DigestForm — manual tx-digest fallback inside the /pay/[slug] receipt.
 * Lets a payer paste a Sui tx digest if the auto-poller didn't pick up
 * their payment.
 *
 * Verbatim port from `apps/web/components/pay/DigestForm.tsx`. Same
 * collapsed → expanded state machine, same validation regex
 * (`^[A-Za-z0-9+/=]{32,88}$`).
 */

import { type FormEvent, useState } from "react";

interface DigestFormProps {
  onError: (error: string) => void;
  onSuccess: (digest: string) => void;
  slug: string;
}

export function DigestForm({ slug, onSuccess, onError }: DigestFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [digest, setDigest] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = digest.trim();
    if (!trimmed) {
      return;
    }

    if (!/^[A-Za-z0-9+/=]{32,88}$/.test(trimmed)) {
      onError("Invalid transaction digest format");
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch(`/api/payments/${slug}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digest: trimmed,
          paymentMethod: "manual",
        }),
      });

      const result = (await res.json()) as {
        status?: string;
        txDigest?: string;
        error?: string;
      };

      if (result.status === "paid") {
        onSuccess(result.txDigest ?? trimmed);
      } else if (result.error) {
        onError(result.error);
      } else {
        onError(
          "Could not verify this transaction. Please check the digest and try again."
        );
      }
    } catch {
      onError("Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  if (!expanded) {
    return (
      <button
        className="w-full py-1 text-center font-mono text-[10px] tracking-[0.06em] text-fg-muted transition hover:text-fg-primary"
        onClick={() => setExpanded(true)}
        type="button"
      >
        I already sent payment →
      </button>
    );
  }

  return (
    <form className="space-y-2" onSubmit={handleSubmit}>
      <label
        className="block font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted"
        htmlFor={`digest-input-${slug}`}
      >
        Transaction digest
      </label>
      <input
        autoFocus
        className="h-10 w-full rounded-xs border border-border-subtle bg-surface-page px-3 font-mono text-[11px] text-fg-primary placeholder:text-fg-muted focus:border-border-focus focus:outline-none"
        disabled={verifying}
        id={`digest-input-${slug}`}
        onChange={(e) => setDigest(e.target.value)}
        placeholder="e.g. 5Kx9V3..."
        type="text"
        value={digest}
      />
      <div className="flex gap-2">
        <button
          className="h-10 flex-1 rounded-pill border border-border-strong bg-transparent font-mono text-[11px] uppercase tracking-[0.06em] text-fg-primary transition hover:bg-surface-sunken focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!digest.trim() || verifying}
          type="submit"
        >
          {verifying ? "Verifying..." : "Verify"}
        </button>
        <button
          className="h-10 rounded-pill border border-border-subtle bg-transparent px-4 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-secondary transition hover:bg-surface-sunken hover:text-fg-primary focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          onClick={() => {
            setExpanded(false);
            setDigest("");
          }}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
