"use client";

import { useState } from "react";
import { GATEWAY_BASE } from "@/lib/tasks";

// Claim form for tasks whose qualifying event lives outside our ledger
// (buy-manifest / buy-sui: the swap tx digest) — and the retry path for the
// auto tasks (address only). Public endpoint; all verification is on-chain
// server-side. No session needed — the address you claim for is where the
// reward lands, paid through the standard rail buy.
export function TaskClaimForm({
  task,
  needsDigest,
}: {
  task: string;
  needsDigest: boolean;
}) {
  const [address, setAddress] = useState("");
  const [digest, setDigest] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState("");

  async function claim() {
    setState("busy");
    setMessage("");
    setReceipt("");
    try {
      const res = await fetch(`${GATEWAY_BASE}/tasks/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task,
          address: address.trim(),
          ...(needsDigest ? { txDigest: digest.trim() } : {}),
        }),
      });
      const json = (await res.json()) as {
        paid?: boolean;
        error?: string;
        note?: string;
        suiscan?: string;
        netUsd?: number;
      };
      if (json.paid) {
        setState("done");
        setMessage(`Paid $${json.netUsd} to your agent.`);
        setReceipt(json.suiscan ?? "");
      } else {
        setState("error");
        setMessage(json.error ?? json.note ?? "Not paid.");
      }
    } catch {
      setState("error");
      setMessage("Network error — try again.");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 font-mono text-foreground text-xs outline-none placeholder:text-muted-foreground/40 focus:border-border";

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputCls}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Your agent wallet (0x…)"
          value={address}
        />
        {needsDigest && (
          <input
            className={inputCls}
            onChange={(e) => setDigest(e.target.value)}
            placeholder="Swap tx digest"
            value={digest}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full border border-border/60 px-4 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-secondary disabled:opacity-50"
          disabled={
            state === "busy" ||
            !address.trim() ||
            (needsDigest && !digest.trim())
          }
          onClick={claim}
          type="button"
        >
          {state === "busy"
            ? "Verifying…"
            : needsDigest
              ? "Verify & claim"
              : "Retry my payout"}
        </button>
        {message && (
          <span
            className={`text-xs ${state === "done" ? "text-emerald-500" : "text-muted-foreground"}`}
          >
            {message}{" "}
            {receipt && (
              <a
                className="underline underline-offset-4 hover:text-foreground"
                href={receipt}
                rel="noreferrer"
                target="_blank"
              >
                receipt ↗
              </a>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
