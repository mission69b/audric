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
        className="w-full py-1 text-center font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground transition hover:text-foreground"
        onClick={() => setExpanded(true)}
        type="button"
      >
        Already paid manually? →
      </button>
    );
  }

  return (
    <form className="space-y-2 text-left" onSubmit={handleSubmit}>
      <label
        className="block font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground"
        htmlFor={`digest-input-${slug}`}
      >
        Transaction digest
      </label>
      <input
        autoFocus
        className="h-[38px] w-full rounded-lg border border-border bg-muted px-3 font-mono text-[13px] text-foreground tracking-[0.02em] placeholder:text-muted-foreground focus:border-ring focus:outline-none"
        disabled={verifying}
        id={`digest-input-${slug}`}
        onChange={(e) => setDigest(e.target.value)}
        placeholder="Hp4oHHs…"
        type="text"
        value={digest}
      />
      <div className="flex gap-2">
        <button
          className="inline-flex h-[38px] flex-1 items-center justify-center rounded-lg border border-border bg-transparent font-medium font-sans text-[13px] text-foreground tracking-[-0.011em] transition hover:bg-accent focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!digest.trim() || verifying}
          type="submit"
        >
          {verifying ? "Verifying…" : "Verify payment"}
        </button>
        <button
          className="inline-flex h-[38px] items-center justify-center rounded-lg border border-border bg-transparent px-4 font-medium font-sans text-[13px] text-muted-foreground tracking-[-0.011em] transition hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
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
