"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateSelfService } from "@/lib/update-self-service";

// On-chain service editing for the SELF-agent (§II.15a stage 3). Because the
// signed-in Passport IS this agent (owner == agent), it can sign the on-chain
// `service` declaration directly — the thing owner-linked agents can't do
// from the console. Endpoint (on-chain) + price/category (off-chain) in one
// sponsored, gasless save. Wrap-an-API deploys stay CLI-only in v1 (§II.15b.4).
const CATEGORIES = [
  "ai-models",
  "data-feeds",
  "finance",
  "research",
  "dev-tools",
  "creative",
  "other",
] as const;

const inputCls =
  "mt-1 w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-foreground text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring";

export function SelfServiceCard({
  mcpEndpoint,
  priceUsdc,
  category,
}: {
  mcpEndpoint: string | null;
  priceUsdc: string | null;
  category: string | null;
}) {
  const router = useRouter();
  const [endpoint, setEndpoint] = useState(mcpEndpoint ?? "");
  const [price, setPrice] = useState(priceUsdc ?? "");
  const [cat, setCat] = useState(category ?? "");
  const [status, setStatus] = useState<"idle" | "signing" | "saved" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  async function save() {
    setStatus("signing");
    setError("");
    try {
      await updateSelfService({
        // "" clears the endpoint (delists); a value declares it. x402 is the
        // rail's only payment method — set it whenever an endpoint exists.
        mcpEndpoint: endpoint.trim(),
        paymentMethods: endpoint.trim() ? ["x402"] : [],
        ...(price.trim() ? { priceUsdc: price.trim() } : {}),
        ...(cat ? { category: cat } : {}),
      });
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-5">
      <div className="font-medium text-foreground text-sm">
        Sell a service as this Passport
      </div>
      <p className="mt-1 text-muted-foreground/70 text-xs">
        Declare a self-hosted endpoint with a price — it lists in the store and
        buyers pay you per call (escrowed, auto-refund on failed delivery).
        Signed by your Passport on-chain, sponsored. No endpoint of your own?
        Wrap any API with the deploy card below.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-muted-foreground/70 text-xs">
            Service endpoint (https) — empty delists
          </span>
          <input
            className={inputCls}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://my-agent.example/api"
            value={endpoint}
          />
        </label>
        <label className="block">
          <span className="text-muted-foreground/70 text-xs">
            Price (USDC / call) — you receive the net after the 2.5% rail fee
          </span>
          <input
            className={inputCls}
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.02"
            value={price}
          />
        </label>
        <label className="block">
          <span className="text-muted-foreground/70 text-xs">
            Store category
          </span>
          <select
            className={inputCls}
            onChange={(e) => setCat(e.target.value)}
            value={cat}
          >
            <option value="">— none —</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={status === "signing"}
          onClick={save}
          type="button"
        >
          {status === "signing" ? "Signing…" : "Save on-chain"}
        </button>
        {status === "saved" && (
          <span className="text-green-500 text-sm">Saved ✓</span>
        )}
        {status === "error" && (
          <span className="text-destructive text-sm">{error}</span>
        )}
      </div>
    </div>
  );
}
