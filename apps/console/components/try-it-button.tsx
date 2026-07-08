"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUY_PHASE_EVENT, type BuyPhase } from "@/components/buy-flow-rail";
import {
  hasWalletSession,
  TRY_IT_CAP_USD,
  type TryResult,
  tryService,
} from "@/lib/try-service";

// The listing-page buy button (§II.15a stage 4). Client island on a public
// server-rendered page — the session lives in localStorage (same origin as
// /manage), so the page itself stays cache-friendly and this button decides
// its own state after hydration. Explicit confirm before any signature.
export function TryItButton({
  seller,
  priceUsdc,
  name,
  slug,
}: {
  seller: string;
  priceUsdc: string;
  name: string;
  /** Store v2 Phase 1: catalog SKU — buys `commerce/pay/{seller}/{slug}`. */
  slug?: string | null;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [phase, setPhaseState] = useState<BuyPhase>("idle");
  const [result, setResult] = useState<TryResult | null>(null);
  const [error, setError] = useState("");

  // Broadcast the phase so the BuyFlowRail above lights the live step —
  // sibling islands on a server page, decoupled via a window event.
  const setPhase = (next: BuyPhase) => {
    setPhaseState(next);
    window.dispatchEvent(new CustomEvent(BUY_PHASE_EVENT, { detail: next }));
  };

  useEffect(() => {
    setSignedIn(hasWalletSession());
  }, []);

  const price = Number.parseFloat(priceUsdc);
  if (!Number.isFinite(price) || price <= 0 || price > TRY_IT_CAP_USD) {
    return null; // outside the in-browser cap — the CLI/curl paths remain.
  }

  // Pre-hydration + signed-out: a sign-in pointer, never a dead button.
  if (signedIn === null) {
    return null;
  }
  if (!signedIn) {
    return (
      <div
        className="rounded-[10px] border p-4"
        style={{
          background: "var(--ag-canvas)",
          borderColor: "var(--ag-border)",
        }}
      >
        <div className="font-medium text-foreground text-sm">
          Try it in the browser
        </div>
        <p className="mt-1 text-fg-muted text-xs">
          Sign in with Google to pay ${priceUsdc} from your Passport wallet and
          see the response right here — escrowed, auto-refund if delivery fails.
        </p>
        <Link className="ag-btn ag-btn--primary ag-btn--sm mt-3" href="/manage">
          Sign in to try it
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-[10px] border p-4"
      style={{
        background: "var(--ag-canvas)",
        borderColor: "var(--ag-border)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-foreground text-sm">
            Try it in the browser
          </div>
          <p className="mt-1 text-fg-muted text-xs">
            Pays ${priceUsdc} in USDC from your Passport wallet — escrowed,
            auto-refund if delivery fails.
          </p>
        </div>
        {phase === "idle" && (
          <button
            className="ag-btn ag-btn--primary"
            onClick={() => setPhase("confirm")}
            type="button"
          >
            Try it — ${priceUsdc}
          </button>
        )}
      </div>

      {phase === "confirm" && (
        <div
          className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: "var(--ag-border-hi)" }}
        >
          <span className="text-foreground text-sm">
            Pay <span className="font-semibold">${priceUsdc} USDC</span> to{" "}
            {name}?
          </span>
          <button
            className="ag-btn ag-btn--primary ag-btn--sm"
            onClick={async () => {
              setPhase("paying");
              setError("");
              try {
                const r = await tryService({ seller, priceUsdc, slug });
                setResult(r);
                setPhase(r.error ? "error" : "done");
                if (r.error) {
                  setError(r.error);
                }
              } catch (e) {
                setError(e instanceof Error ? e.message : "Payment failed.");
                setPhase("error");
              }
            }}
            type="button"
          >
            Confirm — pay ${priceUsdc}
          </button>
          <button
            className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
            onClick={() => setPhase("idle")}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      {phase === "paying" && (
        <p className="mt-3 text-muted-foreground text-sm">
          Signing + paying… the response arrives in the same round trip.
        </p>
      )}

      {phase === "done" && result && (
        <div className="mt-3">
          <div
            className="font-mono text-xs"
            style={{ color: "var(--ag-verify)" }}
          >
            ✓ Delivered{result.digest ? " · settled on Sui" : ""}
          </div>
          <pre
            className="mt-2 max-h-80 overflow-auto rounded-lg border p-3 font-mono text-muted-foreground text-xs leading-relaxed"
            style={{ background: "#0d0d0d", borderColor: "var(--ag-border)" }}
          >
            {typeof result.response === "string"
              ? result.response
              : JSON.stringify(result.response, null, 2)}
          </pre>
          {result.digest && (
            <a
              className="mt-2 inline-block text-fg-muted text-xs underline underline-offset-4 hover:text-foreground"
              href={`https://suiscan.xyz/mainnet/tx/${result.digest}`}
              rel="noreferrer"
              target="_blank"
            >
              View the settlement tx ↗
            </a>
          )}
        </div>
      )}

      {phase === "error" && (
        <div className="mt-3 text-sm">
          <p className="text-destructive">{error}</p>
          {result?.refunded && (
            <p className="mt-1 text-fg-muted text-xs">
              You were refunded the full amount automatically.
            </p>
          )}
          {error.toLowerCase().includes("balance") && (
            <p className="mt-1 text-fg-muted text-xs">
              Your wallet needs USDC on Sui —{" "}
              <Link className="underline underline-offset-4" href="/manage">
                see your deposit address
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
