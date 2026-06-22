"use client";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect } from "react";
import { TIERS } from "@/lib/credit/tiers";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

// Checkout is forced light (fixed colors, not theme tokens) so it blends with
// Stripe's light embedded panel regardless of the app's dark/light theme.
function CheckoutInner() {
  const params = useSearchParams();
  const router = useRouter();
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
            ? { tier: plan, acceptedTerms: true }
            : { amountUsd: topup, acceptedTerms: true }
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

  return (
    <div className="min-h-dvh w-full bg-white text-neutral-900">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-5 py-10 md:grid-cols-2 md:py-16">
        {/* Personalized summary */}
        <div className="flex flex-col">
          <Link
            className="mb-8 inline-flex w-fit items-center gap-1.5 text-neutral-500 text-sm transition-colors hover:text-neutral-900"
            href={`${BASE}/settings/billing`}
          >
            <ArrowLeftIcon className="size-4" /> Back
          </Link>

          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          <p className="mt-1 text-neutral-500 text-sm">{subtitle}</p>

          {isSub && tier && (
            <div className="mt-6">
              <div className="font-semibold text-3xl tabular-nums">
                ${tier.priceUsd}
                <span className="ml-1 font-medium text-base text-neutral-500">
                  /mo
                </span>
                {tier.originalPriceUsd ? (
                  <span className="ml-2 text-base text-neutral-400 line-through">
                    ${tier.originalPriceUsd}
                  </span>
                ) : null}
              </div>
              <ul className="mt-5 space-y-2.5">
                {tier.features.map((f) => (
                  <li className="flex gap-2 text-neutral-700 text-sm" key={f}>
                    <span className="text-signal">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isSub && topup ? (
            <div className="mt-6 font-semibold text-3xl tabular-nums">
              ${topup.toFixed(2)}
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
            <p className="text-neutral-500 text-xs leading-relaxed">
              Thanks for backing Audric — it means a lot.
              <br />
              Questions? Reply to any email or grab time with me.
              <br />
              <span className="text-neutral-700">— funkii, founder</span>
            </p>
          </div>
        </div>

        {/* Stripe Embedded Checkout (Link / saved cards / one-click intact) */}
        <div className="md:pt-1">
          <EmbeddedCheckoutProvider
            options={{ fetchClientSecret }}
            stripe={stripePromise}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
          <p className="mt-4 text-[11px] text-neutral-400 leading-relaxed">
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
