"use client";

import { loadStripeOnramp } from "@stripe/crypto";
import { useCallback, useEffect, useRef, useState } from "react";

// Shared across console + audric web-v3 (S.684) — styling is app-neutral
// Tailwind only; both apps' tokens map the semantic classes to their themes.

// Stripe fiat→USDC onramp — client half (SPEC_ONRAMP, S.687). The embedded
// onramp WIDGET: the server mints a session pinned to the Passport (USDC on
// Sui, wallet locked) and Stripe renders the entire flow — email, OTP, KYC,
// card, 3DS — inside the iframe mounted here. This replaced the headless
// Embedded Components state machine (S.681–S.686): five debug rounds of
// frame/messenger bugs vs. one mount call.

type SessionStatus =
  | "initialized"
  | "rejected"
  | "requires_payment"
  | "fulfillment_processing"
  | "fulfillment_complete"
  | (string & {});

async function api(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/onramp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error ?? `Request failed (${res.status})`));
  }
  return json;
}

export function OnrampFlow({
  address,
  publishableKey,
}: {
  /** The signed-in Passport — the ONLY destination (pinned server-side). */
  address: string;
  /** Prefill is handled server-side via the session; prop kept for compat. */
  sessionEmail?: string | null;
  publishableKey: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [tryCount, setTryCount] = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onHosted = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api({ action: "hosted-session" });
      const url = String(r.redirect_url ?? "");
      if (!url.startsWith("https://")) {
        throw new Error("Couldn't open Stripe's page — try again.");
      }
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, []);

  // Mint the session + load the widget SDK in parallel, then mount. tryCount
  // re-runs everything after an error.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tryCount is the retry trigger — bumping it re-runs the init.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [session, onramp] = await Promise.all([
          api({ action: "widget-session" }),
          loadStripeOnramp(publishableKey),
        ]);
        if (cancelled) {
          return;
        }
        if (session.unsupported) {
          setUnsupported(true);
          setLoading(false);
          return;
        }
        const clientSecret = String(session.client_secret ?? "");
        if (!(onramp && clientSecret)) {
          throw new Error("Couldn't load Stripe's onramp — try again.");
        }
        const container = containerRef.current;
        if (!container) {
          return;
        }
        container.innerHTML = "";
        onramp
          .createSession({ clientSecret, appearance: { theme: "dark" } })
          .addEventListener("onramp_session_updated", (event) => {
            setStatus(event.payload.session.status as SessionStatus);
          })
          .mount(container);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishableKey, tryCount]);

  if (unsupported) {
    return (
      <div className="max-w-[480px]">
        <p className="m-0 text-muted-foreground text-sm">
          Card purchases aren't available in your country yet — Stripe's onramp
          currently covers the US and EU. You can still fund the wallet by
          sending USDC on Sui to your Passport address:
        </p>
        <p className="mt-3 mb-0 break-all rounded-lg border border-border px-3 py-2 font-mono text-foreground text-xs">
          {address}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[480px]">
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
          <button
            className="ml-3 underline underline-offset-2"
            onClick={() => setTryCount((n) => n + 1)}
            type="button"
          >
            Retry
          </button>
          {/* Fallback that can't share the widget's failure mode. */}
          <button
            className="mt-2 block underline underline-offset-2"
            disabled={busy}
            onClick={onHosted}
            type="button"
          >
            Or buy on Stripe's page instead ↗
          </button>
        </div>
      )}

      {loading && !error && (
        <p className="m-0 text-muted-foreground text-sm">
          Loading secure payment…
        </p>
      )}

      {/* Stripe's onramp widget renders here — their UI, end to end. */}
      <div ref={containerRef} />

      {status === "fulfillment_complete" && (
        <p className="mt-3 mb-0 text-foreground text-sm">
          Done — USDC is on its way to your Passport wallet. It appears in your
          balance within a couple of minutes.
        </p>
      )}

      {!(loading || error) && (
        <p className="mt-3 mb-0 text-muted-foreground/70 text-xs">
          Stripe handles identity and payment — card details never touch this
          site. USDC is delivered to{" "}
          <span className="font-mono">{`${address.slice(0, 8)}…${address.slice(-6)}`}</span>
          .
        </p>
      )}
    </div>
  );
}
