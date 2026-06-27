"use client";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { TIERS, TOPUP_PERKS } from "@/lib/credit/tiers";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

// Checkout uses the app's theme tokens (light/dark). The resolved theme is
// sent to the session route so Stripe's embedded panel background matches the
// shell (bg-sidebar) — see CHECKOUT_PANEL_BG.
function CheckoutInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { status: authStatus, login } = useZkLogin();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Checkout is forced-light (see checkout/layout.tsx) so Stripe's fixed light
  // chrome doesn't clash with a dark app shell.
  const theme = "light";
  const plan = params.get("plan"); // "pro" | "max"
  const topupRaw = params.get("topup"); // dollars
  const topup = topupRaw ? Math.floor(Number(topupRaw)) : null;
  const isSub = Boolean(plan);
  const tier = TIERS.find((t) => t.id === plan);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch(
      isSub ? `${BASE}/api/credit/subscribe` : `${BASE}/api/credit/checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSub
            ? { tier: plan, acceptedTerms: true, theme }
            : { amountUsd: topup, acceptedTerms: true, theme }
        ),
      }
    );
    const j = await res.json();
    if (!j.clientSecret) {
      throw new Error(j.error ?? "Couldn't start checkout.");
    }
    return j.clientSecret as string;
  }, [isSub, plan, topup]);

  const invalid = !(isSub || (topup && topup > 0)) || !stripePromise;
  useEffect(() => {
    if (invalid) {
      router.replace(`${BASE}/settings/billing`);
    }
  }, [invalid, router]);
  if (invalid) {
    return null;
  }

  const title = isSub
    ? `Subscribe to Audric ${tier?.name ?? ""}`.trim()
    : `Add $${topup} credit`;
  const subtitle = isSub
    ? (tier?.tagline ?? "All the models, generous")
    : "Pay-as-you-go — credit never expires.";

  let panel: ReactNode;
  if (authStatus === "loading" || !mounted) {
    panel = (
      <div className="flex h-96 items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (authStatus === "authenticated") {
    panel = (
      <EmbeddedCheckoutProvider
        key={theme}
        options={{ fetchClientSecret }}
        stripe={stripePromise}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    );
  } else {
    panel = (
      <div className="rounded-2xl border border-border/60 bg-background p-6">
        <h2 className="font-semibold text-foreground text-lg">
          Sign in to continue
        </h2>
        <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
          Create your Passport wallet with Google — no seed phrase, no card to
          start. You'll come right back here to finish.
        </p>
        <button
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
          onClick={() =>
            login(window.location.pathname + window.location.search)
          }
          type="button"
        >
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full bg-sidebar text-foreground">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-5 py-10 md:grid-cols-2 md:py-16">
        {/* Personalized summary */}
        <div className="flex flex-col">
          <Link
            className="mb-8 inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            href={`${BASE}/settings/billing`}
          >
            <ArrowLeftIcon className="size-4" /> Back
          </Link>

          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>

          {isSub && tier && (
            <div className="mt-6">
              <div className="font-semibold text-3xl tabular-nums">
                ${tier.priceUsd}
                <span className="ml-1 font-medium text-base text-muted-foreground">
                  /mo
                </span>
                {tier.originalPriceUsd ? (
                  <span className="ml-2 text-base text-muted-foreground/60 line-through">
                    ${tier.originalPriceUsd}
                  </span>
                ) : null}
              </div>
              <ul className="mt-5 space-y-2.5">
                {tier.features.map((f) => (
                  <li className="flex gap-2 text-foreground/80 text-sm" key={f}>
                    <span className="text-signal">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isSub && topup ? (
            <div className="mt-6">
              <div className="font-semibold text-3xl tabular-nums">
                ${topup.toFixed(2)}
              </div>
              <ul className="mt-5 space-y-2.5">
                {TOPUP_PERKS.map((f) => (
                  <li className="flex gap-2 text-foreground/80 text-sm" key={f}>
                    <span className="text-signal">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Founder note (Zinc-style personal touch) */}
          <div className="mt-auto flex items-center gap-3 pt-10">
            {/* biome-ignore lint/performance/noImgElement: tiny static avatar */}
            <img
              alt="funkii"
              className="size-9 rounded-full object-cover"
              src="/founder.png"
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Thanks for backing Audric — it means a lot.
              <br />
              Questions? Reply to any email or grab time with me.
              <br />
              <span className="text-foreground">— funkii, founder</span>
            </p>
          </div>
        </div>

        {/* Stripe Embedded Checkout (Link / saved cards / one-click intact),
            gated behind sign-in for anon users (e.g. from the pricing page). */}
        <div className="md:pt-1">
          {panel}
          <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
            By continuing you agree to Audric's closed-loop credit terms —
            credit is non-refundable, non-withdrawable, and non-transferable.
            Operated by T2000 AFI Inc.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}
