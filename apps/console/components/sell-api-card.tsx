"use client";

import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { fromBase64 } from "@mysten/sui/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

// The seller flow (SPEC_INFERENCE_DEMAND item 13) — "Sell your API" card on
// the SELF-agent edit page. Paste an x402 endpoint → server live-probes it
// (must answer 402 with a valid Sui challenge) → one gasless zkLogin
// signature sets it on-chain (registry `update`) → listed on the public
// profile immediately. No human review in the loop.

type ProbeIssue = { code?: string; severity?: string; message?: string };
type PrepareResponse = {
  nonce?: string;
  txBytes?: string;
  probe?: {
    ok: boolean;
    recipient?: string | null;
    amount?: string | null;
    currency?: string | null;
    statusCode?: number;
    issues?: ProbeIssue[];
  } | null;
  error?: { message?: string } | string;
};

function errText(e: PrepareResponse["error"], fallback: string): string {
  return typeof e === "string" ? e : (e?.message ?? fallback);
}

export function SellApiCard({
  currentEndpoint,
}: {
  currentEndpoint: string | null;
}) {
  const router = useRouter();
  const [endpoint, setEndpoint] = useState(currentEndpoint ?? "");
  const [busy, setBusy] = useState<"idle" | "listing" | "removing">("idle");
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<ProbeIssue[]>([]);
  const [listed, setListed] = useState<{
    amount: string | null;
    currency: string | null;
  } | null>(null);

  async function run(nextEndpoint: string, mode: "listing" | "removing") {
    const session = loadSession();
    if (!session || isSessionExpired(session)) {
      setError("Your session expired — sign in again first.");
      return;
    }
    setBusy(mode);
    setError("");
    setIssues([]);
    setListed(null);
    try {
      const prep = await fetch("/api/agent/service-prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: nextEndpoint }),
      });
      const pj = (await prep.json().catch(() => ({}))) as PrepareResponse;
      if (!prep.ok) {
        if (pj.probe?.issues?.length) {
          setIssues(pj.probe.issues);
        }
        throw new Error(errText(pj.error, "Couldn't prepare the listing."));
      }
      if (!(pj.nonce && pj.txBytes)) {
        throw new Error("Couldn't prepare the listing.");
      }
      const signer = toZkLoginSigner(session);
      const { signature } = await signer.signTransaction(
        fromBase64(pj.txBytes)
      );
      const sub = await fetch("/api/agent/service-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: pj.nonce, signature }),
      });
      const sj = (await sub.json().catch(() => ({}))) as PrepareResponse;
      if (!sub.ok) {
        throw new Error(errText(sj.error, "On-chain update failed."));
      }
      if (mode === "listing") {
        setListed({
          amount: pj.probe?.amount ?? null,
          currency: pj.probe?.currency ?? null,
        });
      } else {
        setEndpoint("");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="ag-card grid gap-4 p-6">
      <div>
        <div className="font-semibold text-[14.5px] text-foreground">
          Sell your API
        </div>
        <p className="m-0 mt-1 text-[12.5px] text-fg-subtle leading-relaxed">
          Charge USDC per call with x402. Paste your endpoint — it&apos;s
          probed live (must answer 402 with a Sui payment challenge), then one
          gasless signature lists it on your public profile. Buyers pay per
          call, straight to your wallet.{" "}
          <a
            className="font-medium"
            href="https://developers.t2000.ai/sell-your-api"
            rel="noopener noreferrer"
            style={{ color: "var(--ag-accent)" }}
            target="_blank"
          >
            How to build the endpoint →
          </a>
        </p>
      </div>

      <label className="grid gap-[7px]">
        <span className="font-medium text-[12.5px] text-foreground">
          x402 endpoint (https)
        </span>
        <input
          className="ag-input font-mono text-[12.5px]"
          maxLength={512}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://api.yourservice.com/v1/search"
          value={endpoint}
        />
      </label>

      {issues.length > 0 && (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {issues.map((issue, i) => (
            <li
              className="font-mono text-[11.5px] text-destructive leading-[1.5]"
              // biome-ignore lint/suspicious/noArrayIndexKey: static probe result
              key={i}
            >
              ✗ {issue.message ?? issue.code}
            </li>
          ))}
        </ul>
      )}

      {listed && (
        <p className="m-0 font-mono text-[11.5px] leading-[1.55]" style={{ color: "var(--ag-verify)" }}>
          ✓ Live probe passed
          {listed.amount ? ` — ${listed.amount} ${listed.currency ?? "USDC"} per call` : ""}
          . Listed on your public profile.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="ag-btn ag-btn--primary disabled:opacity-50"
          disabled={busy !== "idle" || !endpoint.trim()}
          onClick={() => run(endpoint.trim(), "listing")}
          type="button"
        >
          {busy === "listing" ? "Probing + signing…" : "Verify & list"}
        </button>
        {currentEndpoint && (
          <button
            className="ag-btn ag-btn--ghost text-xs disabled:opacity-50"
            disabled={busy !== "idle"}
            onClick={() => run("", "removing")}
            type="button"
          >
            {busy === "removing" ? "Removing…" : "Remove listing"}
          </button>
        )}
        {error && <span className="text-destructive text-xs">{error}</span>}
      </div>

      <p className="m-0 font-mono text-[11.5px] text-fg-subtle leading-[1.55]">
        {"// Buyers call it with "}
        <span className="text-fg-muted">t2 pay {endpoint.trim() || "<your-endpoint>"}</span>
        {" — or any x402 client."}
      </p>
    </div>
  );
}
