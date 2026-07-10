"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateSelfService } from "@/lib/update-self-service";

// The service block on /manage/agents/[address] — declare (or clear) the
// Passport self-agent's on-chain paid service: a self-hosted https endpoint,
// a per-call price, and a directory category. The browser equivalent of
// `t2 agent service`.
const CATEGORIES = [
  "ai-models",
  "data-feeds",
  "finance",
  "research",
  "dev-tools",
  "creative",
  "other",
] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-[12.5px] text-foreground">
      {children}
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10.5px] text-fg-subtle leading-[1.5]">
      {children}
    </span>
  );
}

export function SellServiceCard({
  address,
  mcpEndpoint,
  priceUsdc,
  category,
}: {
  address: string;
  mcpEndpoint: string | null;
  priceUsdc: string | null;
  category: string | null;
}) {
  const router = useRouter();
  const isLive = Boolean(mcpEndpoint);

  const [endpoint, setEndpoint] = useState(mcpEndpoint ?? "");
  const [price, setPrice] = useState(priceUsdc ?? "");
  const [cat, setCat] = useState(category ?? "");
  const [status, setStatus] = useState<
    "idle" | "busy" | "done" | "removing" | "error"
  >("idle");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setStatus("busy");
    try {
      // Self-hosted: "" clears the endpoint (delists).
      await updateSelfService({
        mcpEndpoint: endpoint.trim(),
        paymentMethods: endpoint.trim() ? ["x402"] : [],
        ...(price.trim() ? { priceUsdc: price.trim() } : {}),
        ...(cat ? { category: cat } : {}),
      });
      setStatus("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setStatus("error");
    }
  }

  async function takeDown() {
    setError("");
    setStatus("removing");
    try {
      await updateSelfService({ mcpEndpoint: "", paymentMethods: [] });
      setStatus("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delisting failed.");
      setStatus("error");
    }
  }

  return (
    <div className="ag-card grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-[14.5px] text-foreground">
            Paid service (on-chain)
          </div>
          <div className="mt-[3px] max-w-[440px] text-[12px] text-fg-muted leading-[1.5]">
            Declare an endpoint you host + a per-call price — buyers pay over
            x402, escrowed, auto-refund on failed delivery.{" "}
            <a
              className="text-foreground underline underline-offset-4"
              href="https://developers.t2000.ai/agent-id"
              rel="noreferrer"
              target="_blank"
            >
              Delivery contract ↗
            </a>
          </div>
        </div>
        {isLive && (
          <span className="ag-verified px-2.5 py-0.5">
            <span className="ag-dot" style={{ width: 5, height: 5 }} /> Live
          </span>
        )}
      </div>

      <label className="grid gap-[7px]">
        <FieldLabel>Your service endpoint (https) — empty delists</FieldLabel>
        <input
          className="ag-input"
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://my-agent.example/svc/9f2ce81a"
          value={endpoint}
        />
      </label>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <label className="grid content-start gap-[7px]">
          <FieldLabel>Price (USDC / call)</FieldLabel>
          <input
            className="ag-input"
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.02"
            value={price}
          />
          <Hint>You receive the net after the 2.5% facilitator fee.</Hint>
        </label>
        <label className="grid content-start gap-[7px]">
          <FieldLabel>Category</FieldLabel>
          <select
            className="ag-input"
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

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-50"
          disabled={status === "busy"}
          onClick={save}
          type="button"
        >
          {status === "busy" ? "Saving…" : "Save service"}
        </button>
        {isLive && (
          <button
            className="ag-btn ag-btn--ghost ag-btn--sm disabled:opacity-50"
            disabled={status === "removing"}
            onClick={takeDown}
            type="button"
          >
            {status === "removing" ? "Removing…" : "Take down this service"}
          </button>
        )}
        {status === "done" && (
          <span className="text-sm" style={{ color: "var(--ag-verify)" }}>
            Live ✓{" "}
            <a className="underline underline-offset-4" href={`/${address}`}>
              view your profile
            </a>
          </span>
        )}
        {status === "error" && (
          <span className="text-destructive text-sm">{error}</span>
        )}
      </div>
    </div>
  );
}
