"use client";

import { getCalApi } from "@calcom/embed-react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Status = {
  status: "complete" | "open" | "expired";
  kind: string | null;
  tier: string | null;
  amountUsd: string | null;
};

function ReturnInner() {
  const sessionId = useSearchParams().get("session_id");
  const [state, setState] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getCalApi({ namespace: "15min" }).catch(() => undefined);
    if (!sessionId) {
      setFailed(true);
      return;
    }
    fetch(`${BASE}/api/credit/checkout-status?session_id=${sessionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setState)
      .catch(() => setFailed(true));
  }, [sessionId]);

  if (failed || state?.status === "expired") {
    return (
      <Shell>
        <h1 className="font-semibold text-foreground text-xl">
          Checkout didn't complete
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          No charge was made. You can try again from Billing.
        </p>
        <Actions />
      </Shell>
    );
  }

  if (state?.status !== "complete") {
    return (
      <Shell>
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-muted-foreground text-sm">
          Finishing up your payment…
        </p>
      </Shell>
    );
  }

  const headline =
    state.kind === "subscribe"
      ? `You're on Audric ${state.tier ? state.tier[0].toUpperCase() + state.tier.slice(1) : "Pro"}.`
      : `$${state.amountUsd ?? ""} credit added.`;

  return (
    <Shell>
      <span className="flex size-11 items-center justify-center rounded-full bg-signal text-white">
        <CheckIcon className="size-6" />
      </span>
      <h1 className="mt-5 font-semibold text-2xl text-foreground tracking-tight">
        {headline}
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        You're all set — your credit never expires, and the free model is always
        on.
      </p>

      {/* Founder touch + sticker teaser (the claim-stickers flow lands here later) */}
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-background p-4">
        {/* biome-ignore lint/performance/noImgElement: tiny static avatar */}
        <img
          alt="funkii"
          className="size-9 rounded-full object-cover"
          src="/founder.png"
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Thanks for backing Audric. Want to chat?{" "}
          <button
            className="text-signal underline-offset-2 hover:underline"
            data-cal-link="funkii/15min"
            data-cal-namespace="15min"
            type="button"
          >
            Grab 15 min with me
          </button>
          .<br />
          <span className="text-muted-foreground/70">
            Audric merch + stickers — coming soon.
          </span>
        </p>
      </div>

      <Actions />
    </Shell>
  );
}

function Actions() {
  return (
    <div className="mt-7 flex gap-3">
      <Link
        className="rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90"
        href={`${BASE}/`}
      >
        Start using Audric
      </Link>
      <Link
        className="rounded-lg border border-border px-4 py-2 text-foreground text-sm transition-colors hover:bg-accent"
        href={`${BASE}/settings/billing`}
      >
        Billing
      </Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-sidebar text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
        {children}
      </div>
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnInner />
    </Suspense>
  );
}
