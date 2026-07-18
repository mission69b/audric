"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { runJobAction } from "@/lib/job-action";
import { submitJobReview } from "@/lib/job-review";

// The in-place verbs on a job row (t2 ACP Phase 2 — the browser inbox):
// seller delivers (text → content-addressed store → hash on-chain), buyer
// releases or rejects. One sponsored Passport signature each. Success swaps
// to a confirmation and refreshes the server-rendered inbox.

const SUISCAN = "https://suiscan.xyz/mainnet";

export function DeliverForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "done">("idle");
  const [error, setError] = useState("");
  const [digest, setDigest] = useState<string | undefined>();

  async function deliver() {
    if (!text.trim()) {
      setError("Write the delivery first — the buyer receives this text.");
      return;
    }
    setStatus("signing");
    setError("");
    try {
      const res = await runJobAction({
        action: "deliver",
        jobId,
        deliveryText: text.trim(),
      });
      setDigest(res.digest);
      setStatus("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delivery failed — try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="grid gap-1.5">
        <div className="font-medium text-[13px] text-emerald-500">
          Delivered — the buyer's review window is open.
        </div>
        {digest && (
          <a
            className="font-mono text-[11.5px] text-fg-muted underline decoration-border underline-offset-4 hover:text-foreground"
            href={`${SUISCAN}/tx/${digest}`}
            rel="noreferrer"
            target="_blank"
          >
            Delivery tx ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <textarea
        className="ag-input min-h-24 resize-y"
        onChange={(e) => {
          setText(e.target.value);
          setError("");
        }}
        placeholder="Paste the work here — the buyer receives exactly this text, and its hash is pinned on-chain."
        rows={4}
        style={{ fontFamily: "var(--font-sans)" }}
        value={text}
      />
      <div className="flex items-center gap-3">
        <button
          className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-50"
          disabled={status === "signing"}
          onClick={deliver}
          type="button"
        >
          {status === "signing" ? "Confirm in your Passport…" : "Deliver"}
        </button>
        <span className="font-mono text-[11px] text-fg-subtle">
          delivery is recorded on-chain
        </span>
      </div>
      {error && <p className="m-0 text-[12.5px] text-destructive">{error}</p>}
    </div>
  );
}

export function BuyerDecision({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "idle" | "releasing" | "rejecting" | "released" | "rejected"
  >("idle");
  const [error, setError] = useState("");
  const [digest, setDigest] = useState<string | undefined>();

  async function act(action: "release" | "reject") {
    setStatus(action === "release" ? "releasing" : "rejecting");
    setError("");
    try {
      const res = await runJobAction({ action, jobId });
      setDigest(res.digest);
      setStatus(action === "release" ? "released" : "rejected");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
      setStatus("idle");
    }
  }

  if (status === "released" || status === "rejected") {
    return (
      <div className="grid gap-1.5">
        <div className="font-medium text-[13px] text-emerald-500">
          {status === "released"
            ? "Released — funds are with the seller."
            : "Rejected — funds split per the job's terms."}
        </div>
        {digest && (
          <a
            className="font-mono text-[11.5px] text-fg-muted underline decoration-border underline-offset-4 hover:text-foreground"
            href={`${SUISCAN}/tx/${digest}`}
            rel="noreferrer"
            target="_blank"
          >
            Settlement tx ↗
          </a>
        )}
      </div>
    );
  }

  const busy = status !== "idle";
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <button
          className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-50"
          disabled={busy}
          onClick={() => act("release")}
          type="button"
        >
          {status === "releasing"
            ? "Confirm in your Passport…"
            : "Accept & release"}
        </button>
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm disabled:opacity-50"
          disabled={busy}
          onClick={() => act("reject")}
          type="button"
        >
          {status === "rejecting" ? "Confirm…" : "Reject"}
        </button>
      </div>
      {error && <p className="m-0 text-[12.5px] text-destructive">{error}</p>}
    </div>
  );
}

// Receipt-bound star review on a RELEASED job the signed-in Passport paid
// for. One signed personal message — no transaction, no gas. Re-submitting
// edits the existing review (the API upserts on jobId).
export function ReviewForm({
  jobId,
  existing,
}: {
  jobId: string;
  existing: { stars: number; text: string | null } | null;
}) {
  const router = useRouter();
  const [stars, setStars] = useState(existing?.stars ?? 0);
  const [text, setText] = useState(existing?.text ?? "");
  const [status, setStatus] = useState<"idle" | "signing" | "done">("idle");
  const [error, setError] = useState("");

  async function submit() {
    if (stars < 1) {
      setError("Pick a star rating first.");
      return;
    }
    setStatus("signing");
    setError("");
    try {
      await submitJobReview({ jobId, stars, text: text.trim() || undefined });
      setStatus("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed — try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="font-medium text-[13px] text-emerald-500">
        Review saved — it shows on the seller's public profile.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-[12px] text-fg-muted">
          {existing ? "Your review" : "Rate this work"}
        </span>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              aria-pressed={n <= stars}
              className={`cursor-pointer border-0 bg-transparent px-0.5 text-[17px] leading-none ${
                n <= stars ? "text-amber-400" : "text-fg-subtle"
              }`}
              key={n}
              onClick={() => {
                setStars(n);
                setError("");
              }}
              type="button"
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="ag-input min-h-16 resize-y"
        maxLength={400}
        onChange={(e) => setText(e.target.value)}
        placeholder="Optional — a line or two about the work (max 400 chars)."
        rows={2}
        style={{ fontFamily: "var(--font-sans)" }}
        value={text}
      />
      <div className="flex items-center gap-3">
        <button
          className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-50"
          disabled={status === "signing"}
          onClick={submit}
          type="button"
        >
          {status === "signing"
            ? "Confirm in your Passport…"
            : existing
              ? "Update review"
              : "Submit review"}
        </button>
        <span className="font-mono text-[11px] text-fg-subtle">
          shows on the seller&apos;s profile
        </span>
      </div>
      {error && <p className="m-0 text-[12.5px] text-destructive">{error}</p>}
    </div>
  );
}
