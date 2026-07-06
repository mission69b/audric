"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deploySelfConfig, removeSelfDeploy } from "@/lib/deploy-self";
import { updateSelfService } from "@/lib/update-self-service";

// ONE selling card (S.639 — founder: "why two cards? it's so confusing").
// The old SelfServiceCard + DeploySelfCard both wrote the SAME service
// record and could silently overwrite each other. The only real difference
// is where the compute lives, so that's now a mode toggle:
//   • self-hosted — you run the endpoint; we point the listing at it
//   • wrap — you only have an API key; t2000 hosts the proxy
// Price + category + the one Save button are shared.
const CATEGORIES = [
  "ai-models",
  "data-feeds",
  "finance",
  "research",
  "dev-tools",
  "creative",
  "other",
] as const;

const RAIL_BASE = "https://x402.t2000.ai";

const inputCls =
  "ag-input mt-1";

type HeaderRow = { k: string; v: string };
type Mode = "self" | "wrap";

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
  const buyUrl = `${RAIL_BASE}/commerce/pay/${address}`;
  const isWrapped = mcpEndpoint === buyUrl;

  const [mode, setMode] = useState<Mode>(isWrapped ? "wrap" : "self");
  // Self-hosted fields
  const [endpoint, setEndpoint] = useState(
    isWrapped ? "" : (mcpEndpoint ?? "")
  );
  // Wrap fields (upstream + headers are write-only — never echoed back)
  const [upstream, setUpstream] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("POST");
  const [headers, setHeaders] = useState<HeaderRow[]>([{ k: "", v: "" }]);
  // Shared
  const [price, setPrice] = useState(priceUsdc ?? "");
  const [cat, setCat] = useState(category ?? "");
  const [status, setStatus] = useState<
    "idle" | "busy" | "done" | "removing" | "error"
  >("idle");
  const [error, setError] = useState("");

  function setHeader(i: number, field: "k" | "v", value: string) {
    setHeaders((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r))
    );
  }

  async function save() {
    setError("");
    setStatus("busy");
    try {
      if (mode === "wrap") {
        const url = upstream.trim();
        if (!(url.startsWith("https://") && price.trim())) {
          throw new Error("An https upstream URL and a price are required.");
        }
        const headerMap = Object.fromEntries(
          headers
            .filter((r) => r.k.trim() && r.v.trim())
            .map((r) => [r.k.trim(), r.v.trim()])
        );
        const stored = await deploySelfConfig({
          upstreamUrl: url,
          method,
          headers: headerMap,
        });
        if (!stored.ok) {
          throw new Error(stored.message);
        }
        await updateSelfService({
          mcpEndpoint: buyUrl,
          paymentMethods: ["x402"],
          priceUsdc: price.trim(),
          ...(cat ? { category: cat } : {}),
        });
        // Write-only secrets: clear after success.
        setHeaders([{ k: "", v: "" }]);
        setUpstream("");
      } else {
        // Self-hosted: "" clears the endpoint (delists).
        await updateSelfService({
          mcpEndpoint: endpoint.trim(),
          paymentMethods: endpoint.trim() ? ["x402"] : [],
          ...(price.trim() ? { priceUsdc: price.trim() } : {}),
          ...(cat ? { category: cat } : {}),
        });
      }
      setStatus("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setStatus("error");
    }
  }

  async function takeDownWrap() {
    setError("");
    setStatus("removing");
    const removed = await removeSelfDeploy();
    if (!removed.ok) {
      setError(removed.message);
      setStatus("error");
      return;
    }
    try {
      await updateSelfService({ mcpEndpoint: "", paymentMethods: [] });
      setStatus("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delisting failed.");
      setStatus("error");
    }
  }

  const modeBtn = (m: Mode, label: string) => (
    <button
      className={`rounded-full px-3 py-1 text-xs transition-colors ${
        mode === m
          ? "bg-primary font-medium text-primary-foreground"
          : "border border-border/60 text-muted-foreground hover:text-foreground"
      }`}
      onClick={() => setMode(m)}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-foreground text-sm">
          Sell a service as this Passport
        </div>
        {isWrapped && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">
            wrapped API · live
          </span>
        )}
      </div>
      <p className="mt-1 text-muted-foreground/70 text-xs">
        List what this Passport sells — buyers pay per call (escrowed,
        auto-refund on failed delivery). One question decides the form: where
        does the service run?
      </p>

      <div className="mt-3 flex gap-2">
        {modeBtn("self", "I host an endpoint")}
        {modeBtn("wrap", "Wrap an API — no server")}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {mode === "self" ? (
          <label className="block sm:col-span-2">
            <span className="text-muted-foreground/70 text-xs">
              Your service endpoint (https) — empty delists.{" "}
              <a
                className="underline underline-offset-4"
                href="https://developers.t2000.ai/commerce/sell"
                rel="noreferrer"
                target="_blank"
              >
                Delivery contract + a 25-line example →
              </a>
            </span>
            <input
              className={inputCls}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://my-agent.example/svc/9f2ce81a"
              value={endpoint}
            />
          </label>
        ) : (
          <>
            <label className="block sm:col-span-2">
              <span className="text-muted-foreground/70 text-xs">
                Upstream URL (https) — the API your service calls. Your key is
                stored encrypted, injected only inside the paid flow, never
                shown again.
              </span>
              <input
                className={inputCls}
                onChange={(e) => setUpstream(e.target.value)}
                placeholder="https://api.example.com/v1/endpoint"
                value={upstream}
              />
            </label>
            {headers.map((row, i) => (
              <div
                className="grid grid-cols-2 gap-3 sm:col-span-2"
                key={`header-${i.toString()}`}
              >
                <label className="block">
                  <span className="text-muted-foreground/70 text-xs">
                    Header name (optional)
                  </span>
                  <input
                    className={inputCls}
                    onChange={(e) => setHeader(i, "k", e.target.value)}
                    placeholder="Authorization"
                    value={row.k}
                  />
                </label>
                <label className="block">
                  <span className="text-muted-foreground/70 text-xs">
                    Value (write-only)
                  </span>
                  <input
                    className={inputCls}
                    onChange={(e) => setHeader(i, "v", e.target.value)}
                    placeholder="Bearer sk-…"
                    type="password"
                    value={row.v}
                  />
                </label>
              </div>
            ))}
            <div className="sm:col-span-2">
              <button
                className="text-muted-foreground text-xs underline underline-offset-4 transition-colors hover:text-foreground"
                onClick={() =>
                  setHeaders((rows) => [...rows, { k: "", v: "" }])
                }
                type="button"
              >
                + add header
              </button>
            </div>
            <label className="block">
              <span className="text-muted-foreground/70 text-xs">Method</span>
              <select
                className={inputCls}
                onChange={(e) =>
                  setMethod(e.target.value === "GET" ? "GET" : "POST")
                }
                value={method}
              >
                <option value="POST">POST — buyer input as the body</option>
                <option value="GET">GET — buyer input as query params</option>
              </select>
            </label>
          </>
        )}

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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={status === "busy"}
          onClick={save}
          type="button"
        >
          {status === "busy"
            ? "Saving…"
            : mode === "wrap"
              ? isWrapped
                ? "Update wrap"
                : "Deploy & list"
              : "Save on-chain"}
        </button>
        {isWrapped && (
          <button
            className="rounded-lg border border-border/60 px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-secondary disabled:opacity-50"
            disabled={status === "removing"}
            onClick={takeDownWrap}
            type="button"
          >
            {status === "removing" ? "Removing…" : "Take down the wrap"}
          </button>
        )}
        {status === "done" && (
          <span className="text-green-500 text-sm">
            Live + listed ✓{" "}
            <a className="underline underline-offset-4" href={`/${address}`}>
              view your listing
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
