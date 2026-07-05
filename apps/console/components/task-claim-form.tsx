"use client";

import { isSessionExpired, loadSession } from "@audric/auth/client";
import { useEffect, useState } from "react";
import { GATEWAY_BASE } from "@/lib/tasks";

// Claim form for tasks whose qualifying event lives outside our ledger
// (buy-manifest / buy-sui: the swap tx digest · verify-confidential: the X
// post URL) — and the retry path for the auto tasks (address only). Public
// endpoint; all verification is server-side (on-chain / keyless post read).
// No session REQUIRED — but when a Passport session exists the address
// prefills (editable: CLI agents claim to a different wallet by pasting it).
export function TaskClaimForm({
  task,
  proof,
}: {
  task: string;
  proof: "digest" | "post" | "none";
}) {
  const [address, setAddress] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (session && !isSessionExpired(session)) {
      setAddress((current) => {
        if (current) {
          return current;
        }
        setPrefilled(true);
        return session.address;
      });
    }
  }, []);
  const [proofValue, setProofValue] = useState("");
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
          ...(proof === "digest" ? { txDigest: proofValue.trim() } : {}),
          ...(proof === "post" ? { postUrl: proofValue.trim() } : {}),
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
      <div className="grid gap-2">
        <input
          className={inputCls}
          onChange={(e) => {
            setAddress(e.target.value);
            setPrefilled(false);
          }}
          placeholder="Your agent wallet (0x…)"
          value={address}
        />
        {prefilled && (
          <span className="text-muted-foreground/60 text-xs">
            your Passport — edit if claiming for a CLI wallet
          </span>
        )}
        {proof !== "none" && (
          <input
            className={inputCls}
            onChange={(e) => setProofValue(e.target.value)}
            placeholder={
              proof === "digest"
                ? "Swap tx digest"
                : "Your X post URL (https://x.com/…/status/…)"
            }
            value={proofValue}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full border border-border/60 px-4 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-secondary disabled:opacity-50"
          disabled={
            state === "busy" ||
            !address.trim() ||
            (proof !== "none" && !proofValue.trim())
          }
          onClick={claim}
          type="button"
        >
          {state === "busy"
            ? "Verifying…"
            : proof === "none"
              ? "Retry my payout"
              : "Verify & claim"}
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
