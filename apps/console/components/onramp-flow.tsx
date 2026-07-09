"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Stripe fiat→USDC onramp — client flow (SPEC_ONRAMP, S.681). One state
// machine: email → Link auth (or register) → KYC (only if needed) → wallet
// register (the Passport, prefilled) → payment method → amount → checkout.
// The @stripe/crypto preview SDK is loaded dynamically; its surface is typed
// locally to exactly the methods we call.

type OnrampCoordinator = {
  authenticate(
    linkAuthIntentId: string,
    callback: (result: {
      result: "success" | "abandoned" | "declined";
      crypto_customer_id?: string;
    }) => void
  ): Promise<HTMLElement>;
  registerLinkUser(info: {
    email: string;
    phone: string;
    country: string;
    fullName?: string;
  }): Promise<{ created?: boolean }>;
  submitKycInfo(info: Record<string, unknown>): Promise<void>;
  /** Presents the Stripe-hosted doc+selfie flow. */
  verifyDocuments(): Promise<{ result: "success" | "abandoned" }>;
  registerWalletAddress(address: string, network: string): Promise<unknown>;
  /** Returns the Payment Element UI — the CALLER must mount it (same
   *  contract as `authenticate`; confirmed against the shipped SDK). The
   *  callback fires when the user submits a payment method. */
  collectPaymentMethod(
    options: Record<string, unknown>,
    callback: (result: { cryptoPaymentToken?: string }) => void
  ): Promise<HTMLElement>;
  performCheckout(
    sessionId: string,
    callback: (sessionId: string) => Promise<string>
  ): Promise<{ successful?: boolean }>;
};

type Step =
  | "email"
  | "authenticating"
  | "register"
  | "kyc"
  | "payment"
  | "amount"
  | "processing"
  | "done";

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
  sessionEmail,
  publishableKey,
}: {
  /** The signed-in Passport — the ONLY destination. */
  address: string;
  sessionEmail: string | null;
  publishableKey: string;
}) {
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(sessionEmail ?? "");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [amount, setAmount] = useState("20");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [formMounted, setFormMounted] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkTry, setSdkTry] = useState(0);
  const onrampRef = useRef<OnrampCoordinator | null>(null);
  const authContainerRef = useRef<HTMLDivElement>(null);
  const paymentContainerRef = useRef<HTMLDivElement>(null);

  // Load + init the SDK (retryable — a failed controller frame or slow CDN
  // must surface a Retry, not the dead-end "still loading" message).
  // biome-ignore lint/correctness/useExhaustiveDependencies: sdkTry is the retry trigger — bumping it re-runs the load.
  useEffect(() => {
    let cancelled = false;
    setSdkReady(false);
    (async () => {
      try {
        const mod = (await import("@stripe/crypto")) as unknown as {
          loadCryptoOnrampAndInitialize?: (
            key: string,
            options?: Record<string, unknown>
          ) => Promise<OnrampCoordinator>;
        };
        const load = mod.loadCryptoOnrampAndInitialize;
        if (!load) {
          throw new Error("Onramp SDK unavailable.");
        }
        const coordinator = await load(publishableKey, { theme: "night" });
        if (!cancelled) {
          onrampRef.current = coordinator;
          setSdkReady(true);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            `Couldn't load Stripe's payment SDK${e instanceof Error ? ` — ${e.message}` : ""}. Retry below.`
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishableKey, sdkTry]);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setBusy(false);
  }, []);

  /** After Link auth succeeds: exchange tokens, check KYC, route the step. */
  const afterAuth = useCallback(
    async (authIntentId: string, cryptoCustomerId: string) => {
      try {
        setCustomerId(cryptoCustomerId);
        await api({ action: "tokens", authIntentId });
        const kyc = await api({
          action: "kyc-status",
          cryptoCustomerId,
        });
        if (kyc.kycStatus === "not_started") {
          setStep("kyc");
        } else {
          const onramp = onrampRef.current;
          if (onramp) {
            await onramp.registerWalletAddress(address, "sui");
          }
          setStep("payment");
        }
        setBusy(false);
      } catch (e) {
        fail(e);
      }
    },
    [address, fail]
  );

  const startAuth = useCallback(
    async (authIntentId: string) => {
      const onramp = onrampRef.current;
      if (!onramp) {
        setError("Payment SDK is still loading — try again.");
        return;
      }
      setStep("authenticating");
      const el = await onramp.authenticate(authIntentId, (result) => {
        if (result.result === "success" && result.crypto_customer_id) {
          authContainerRef.current?.replaceChildren();
          afterAuth(authIntentId, result.crypto_customer_id).catch(fail);
        } else if (result.result === "abandoned") {
          setStep("email");
          setBusy(false);
        } else {
          setError("Link consent is required to continue.");
          setStep("email");
          setBusy(false);
        }
      });
      authContainerRef.current?.replaceChildren(el);
    },
    [afterAuth, fail]
  );

  const onEmailSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api({ action: "auth-intent", email });
      if (r.noAccount) {
        setStep("register");
        setBusy(false);
        return;
      }
      await startAuth(String(r.authIntentId));
    } catch (e) {
      fail(e);
    }
  };

  const onRegister = async () => {
    setError(null);
    setBusy(true);
    try {
      const onramp = onrampRef.current;
      if (!onramp) {
        throw new Error("Payment SDK is still loading — try again.");
      }
      const reg = await onramp.registerLinkUser({
        email,
        phone,
        country: "US",
        fullName: fullName || undefined,
      });
      if (!reg.created) {
        throw new Error("Couldn't create the Link account.");
      }
      const r = await api({ action: "auth-intent", email });
      await startAuth(String(r.authIntentId));
    } catch (e) {
      fail(e);
    }
  };

  const onKyc = async () => {
    // KYC fields are collected by Stripe's hosted doc-verify flow; structured
    // KYC info (SSN etc.) is only needed when doc verification isn't enough.
    setError(null);
    setBusy(true);
    try {
      const onramp = onrampRef.current;
      if (!onramp) {
        throw new Error("Payment SDK is still loading — try again.");
      }
      const verify = await onramp.verifyDocuments();
      if (verify.result === "abandoned") {
        setBusy(false);
        return;
      }
      await onramp.registerWalletAddress(address, "sui");
      setStep("payment");
      setBusy(false);
    } catch (e) {
      fail(e);
    }
  };

  const onCollectPayment = async () => {
    setError(null);
    setBusy(true);
    try {
      const onramp = onrampRef.current;
      if (!onramp) {
        throw new Error("Payment SDK is still loading — try again.");
      }
      // The SDK RETURNS the Payment Element — it must be mounted (the bug the
      // founder's first live test hit: awaiting without mounting = blank).
      const el = await onramp.collectPaymentMethod(
        {
          payment_method_types: ["card"],
          wallets: { applePay: "auto", googlePay: "auto" },
        },
        (result) => {
          if (result.cryptoPaymentToken) {
            paymentContainerRef.current?.replaceChildren();
            setPaymentToken(result.cryptoPaymentToken);
            setStep("amount");
          }
        }
      );
      paymentContainerRef.current?.replaceChildren(el);
      setFormMounted(true);
      setBusy(false);
    } catch (e) {
      fail(e);
    }
  };

  const onBuy = async () => {
    setError(null);
    setBusy(true);
    try {
      const onramp = onrampRef.current;
      if (!(onramp && customerId && paymentToken)) {
        throw new Error("Missing payment setup — start over.");
      }
      const created = await api({
        action: "session",
        cryptoCustomerId: customerId,
        cryptoPaymentToken: paymentToken,
        sourceAmountUsd: Number(amount),
      });
      setStep("processing");
      const result = await onramp.performCheckout(
        String(created.id),
        async (sessionId: string) => {
          const r = await api({ action: "checkout", sessionId });
          return String(r.client_secret);
        }
      );
      if (result.successful) {
        setStep("done");
      } else {
        throw new Error("Checkout did not complete — you were not charged.");
      }
      setBusy(false);
    } catch (e) {
      setStep("amount");
      fail(e);
    }
  };

  const input =
    "w-full rounded-lg border bg-transparent px-3 py-2 text-foreground text-sm outline-none";
  const inputStyle = { borderColor: "var(--ag-border)" };

  return (
    <div className="max-w-[480px]">
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
          {!sdkReady && (
            <button
              className="ml-3 underline underline-offset-2"
              onClick={() => setSdkTry((n) => n + 1)}
              type="button"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {step === "email" && (
        <div className="flex flex-col gap-3">
          <label className="text-fg-muted text-sm" htmlFor="onramp-email">
            Email — Stripe Link handles identity and payment
          </label>
          <input
            className={input}
            id="onramp-email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            type="email"
            value={email}
          />
          <button
            className="ag-btn ag-btn--primary"
            disabled={busy || !sdkReady || !email.includes("@")}
            onClick={onEmailSubmit}
            type="button"
          >
            {busy
              ? "Checking…"
              : sdkReady
                ? "Continue"
                : "Loading payment SDK…"}
          </button>
        </div>
      )}

      {step === "register" && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-fg-muted text-sm">
            No Link account for that email yet — create one:
          </p>
          <input
            className={input}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            style={inputStyle}
            value={fullName}
          />
          <input
            className={input}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (+12125551234)"
            style={inputStyle}
            type="tel"
            value={phone}
          />
          <button
            className="ag-btn ag-btn--primary"
            disabled={busy || phone.length < 8}
            onClick={onRegister}
            type="button"
          >
            {busy ? "Creating…" : "Create Link account"}
          </button>
        </div>
      )}

      {step === "authenticating" && (
        <p className="m-0 text-fg-muted text-sm">
          Complete the Link sign-in below.
        </p>
      )}
      {/* Link's auth element mounts here (their modal-ish widget). */}
      <div className="mt-3" ref={authContainerRef} />

      {step === "kyc" && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-fg-muted text-sm">
            One-time identity verification (a document + selfie, handled by
            Stripe — required by regulation for card→crypto purchases).
          </p>
          <button
            className="ag-btn ag-btn--primary"
            disabled={busy}
            onClick={onKyc}
            type="button"
          >
            {busy ? "Verifying…" : "Verify identity"}
          </button>
        </div>
      )}

      {step === "payment" && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-fg-muted text-sm">
            Add a card (Apple Pay / Google Pay supported).
          </p>
          {!formMounted && (
            <button
              className="ag-btn ag-btn--primary"
              disabled={busy}
              onClick={onCollectPayment}
              type="button"
            >
              {busy ? "Opening…" : "Add payment method"}
            </button>
          )}
        </div>
      )}
      {/* Stripe's Payment Element mounts here (card fields + submit). */}
      <div className="mt-3" ref={paymentContainerRef} />
      {step === "payment" && formMounted && (
        <p className="mt-2 mb-0 text-fg-subtle text-xs">
          Card details go to Stripe directly — t2000 never sees them.
        </p>
      )}

      {step === "amount" && (
        <div className="flex flex-col gap-3">
          <label className="text-fg-muted text-sm" htmlFor="onramp-amount">
            Amount (USD) — delivered as USDC to your Passport
          </label>
          <input
            className={input}
            id="onramp-amount"
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
            value={amount}
          />
          <div className="flex gap-2">
            {["10", "20", "50", "100"].map((v) => (
              <button
                className="ag-btn ag-btn--ghost"
                key={v}
                onClick={() => setAmount(v)}
                type="button"
              >
                ${v}
              </button>
            ))}
          </div>
          <button
            className="ag-btn ag-btn--primary"
            disabled={busy || !(Number(amount) >= 2)}
            onClick={onBuy}
            type="button"
          >
            {busy ? "Working…" : `Buy $${amount} of USDC`}
          </button>
          <p className="m-0 text-fg-subtle text-xs">
            Stripe is the merchant of record — card fees and any 3DS check
            happen in their flow. Funds land at{" "}
            <span className="font-mono">{`${address.slice(0, 8)}…${address.slice(-6)}`}</span>
            .
          </p>
        </div>
      )}

      {step === "processing" && (
        <p className="m-0 text-fg-muted text-sm">
          Processing — don't close this tab…
        </p>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-foreground text-sm">
            Done — USDC is on its way to your Passport wallet. It appears in
            your balance within a couple of minutes.
          </p>
          <a className="ag-btn ag-btn--primary" href="/manage/dashboard">
            Back to the dashboard
          </a>
        </div>
      )}
    </div>
  );
}
