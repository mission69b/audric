import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "@/components/pricing/pricing-plans";

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

      <div className="mt-10">
        <PricingPlans />
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
