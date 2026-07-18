"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { runJobAction } from "@/lib/job-action";

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
          sponsored · one signature
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
