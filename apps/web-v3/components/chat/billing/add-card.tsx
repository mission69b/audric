"use client";

/**
 * Native "add card" via Stripe's embedded Payment Element (Audric v3). Card data
 * goes straight to Stripe through the Element iframe — it never touches our
 * server. Gated on the publishable key; renders nothing when native billing
 * isn't configured (users can still save a card via a top-up Checkout).
 */

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

function CardForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!(stripe && elements)) {
      return;
    }
    setBusy(true);
    const { error } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Couldn't save the card.");
      return;
    }
    toast.success("Card saved.");
    onDone();
  };

  return (
    <div className="space-y-3">
      <PaymentElement />
      <Button disabled={busy} onClick={submit} size="sm" type="button">
        {busy ? "Saving…" : "Save card"}
      </Button>
    </div>
  );
}

export function AddCard({ onAdded }: { onAdded: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Native card entry needs the publishable key — hide entirely without it.
  if (!stripePromise) {
    return null;
  }

  const start = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/billing/setup-intent`, {
        method: "POST",
      });
      const j = await res.json();
      if (j.clientSecret) {
        setClientSecret(j.clientSecret);
      } else {
        toast.error(j.error ?? "Couldn't start card setup.");
      }
    } catch {
      toast.error("Couldn't start card setup.");
    } finally {
      setLoading(false);
    }
  };

  if (!clientSecret) {
    return (
      <Button
        disabled={loading}
        onClick={start}
        size="sm"
        type="button"
        variant="outline"
      >
        {loading ? "…" : "Add card"}
      </Button>
    );
  }

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  return (
    <Elements
      options={{
        clientSecret,
        appearance: { theme: isDark ? "night" : "stripe" },
      }}
      stripe={stripePromise}
    >
      <CardForm
        onDone={() => {
          setClientSecret(null);
          onAdded();
        }}
      />
    </Elements>
  );
}
