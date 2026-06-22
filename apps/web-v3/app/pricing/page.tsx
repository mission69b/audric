import { CheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { COMING_SOON, EVERY_PLAN, TIERS } from "@/lib/credit/tiers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing · Audric",
  description:
    "Private, decentralized AI. Open uncensored models, a non-custodial wallet, and your own data — free to start. Pro and Max add every frontier model with monthly credit.",
};

export default function PricingPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl px-5 py-12">
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Back to Audric
      </Link>

      <div className="mt-8 text-center">
        <h1 className="font-semibold text-4xl text-foreground tracking-tight">
          Private AI, priced simply
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Start free — open, uncensored models, a non-custodial wallet, and your
          own data. Upgrade for every frontier model with monthly credit that
          never expires.
        </p>
      </div>

      {/* Included in every plan — the shared "what Audric is" story */}
      <div className="mt-10 rounded-2xl border border-border/50 bg-card/40 p-6">
        <h2 className="font-medium text-foreground text-sm">
          Included in every plan — Free included
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EVERY_PLAN.map((f) => (
            <li
              className="flex items-start gap-2 text-muted-foreground text-sm"
              key={f}
            >
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-foreground/50" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Tiers */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const featured = tier.id === "pro";
          return (
            <div
              className={cn(
                "flex flex-col rounded-2xl border p-6",
                featured
                  ? "border-foreground/30 bg-card/60 shadow-[var(--shadow-card)]"
                  : "border-border/50 bg-card/30"
              )}
              key={tier.id}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-lg">
                  {tier.name}
                </h3>
                {featured && (
                  <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground/70 uppercase tracking-wide">
                    Popular
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                {tier.originalPriceUsd ? (
                  <span className="text-muted-foreground/50 line-through tabular-nums">
                    ${tier.originalPriceUsd}
                  </span>
                ) : null}
                <span className="font-semibold text-3xl text-foreground tabular-nums">
                  {tier.priceUsd === 0 ? "Free" : `$${tier.priceUsd}`}
                </span>
                {tier.priceUsd ? (
                  <span className="text-muted-foreground text-sm">/mo</span>
                ) : null}
              </div>
              {tier.originalPriceUsd ? (
                <span className="mt-2 inline-block self-start rounded bg-teal-500/10 px-1.5 py-0.5 font-medium text-[11px] text-teal-600 dark:text-teal-400">
                  Beta · 50% off
                </span>
              ) : null}
              <p className="mt-2 text-muted-foreground text-sm">
                {tier.tagline}
              </p>

              <ul className="mt-5 flex-1 space-y-2">
                {tier.features.map((f) => (
                  <li
                    className="flex items-start gap-2 text-muted-foreground text-sm"
                    key={f}
                  >
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-foreground/50" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                className={cn(
                  "mt-6 inline-flex h-9 items-center justify-center rounded-lg px-4 font-medium text-sm transition-colors",
                  featured
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border/60 text-foreground hover:bg-muted"
                )}
                href={tier.priceUsd === 0 ? "/" : `/checkout?plan=${tier.id}`}
              >
                {tier.priceUsd === 0 ? "Start free" : `Get ${tier.name}`}
              </Link>
            </div>
          );
        })}
      </div>

      {/* Coming soon */}
      <div className="mt-6 rounded-2xl border border-border/40 border-dashed p-5">
        <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Coming soon
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {COMING_SOON.map((f) => (
            <li className="text-muted-foreground/70 text-sm" key={f}>
              · {f}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 text-center text-muted-foreground text-xs">
        Sign in with Google — no seed phrase, no card to start.{" "}
        <Link className="text-foreground underline" href="/">
          Start chatting
        </Link>
        .
      </p>
    </div>
  );
}
