"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deploySelfConfig, removeSelfDeploy } from "@/lib/deploy-self";
import { updateSelfService } from "@/lib/update-self-service";

// Wrap-an-API deploys from the browser (S.637) — the Passport-agent
// equivalent of `t2 agent deploy`. Two steps, same as the CLI: (1) store the
// wrap config on the gateway (via the console-attested server action —
// headers encrypted at rest, never echoed back), (2) list it with the
// existing zkLogin-signed sponsored service update. Header VALUES are
// write-only: after a deploy the form clears them.
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
  "mt-1 w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-foreground text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring";

type HeaderRow = { k: string; v: string };

export function DeploySelfCard({
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
  const deployed = mcpEndpoint === buyUrl;

  const [upstream, setUpstream] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("POST");
  const [headers, setHeaders] = useState<HeaderRow[]>([{ k: "", v: "" }]);
  const [price, setPrice] = useState(priceUsdc ?? "");
  const [cat, setCat] = useState(category ?? "");
  const [status, setStatus] = useState<
    "idle" | "storing" | "signing" | "done" | "removing" | "error"
  >("idle");
  const [error, setError] = useState("");

  function setHeader(i: number, field: "k" | "v", value: string) {
    setHeaders((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r))
    );
  }

  async function deploy() {
    setError("");
    const url = upstream.trim();
    const p = price.trim();
    if (!(url.startsWith("https://") && p)) {
      setError("An https upstream URL and a price are required.");
      setStatus("error");
      return;
    }
    const headerMap = Object.fromEntries(
      headers
        .filter((r) => r.k.trim() && r.v.trim())
        .map((r) => [r.k.trim(), r.v.trim()])
    );
    setStatus("storing");
    const stored = await deploySelfConfig({
      upstreamUrl: url,
      method,
      headers: headerMap,
    });
    if (!stored.ok) {
      setError(stored.message);
      setStatus("error");
      return;
    }
    setStatus("signing");
    try {
      await updateSelfService({
        mcpEndpoint: buyUrl,
        paymentMethods: ["x402"],
        priceUsdc: p,
        ...(cat ? { category: cat } : {}),
      });
      // Write-only secrets: clear the values from the form after success.
      setHeaders([{ k: "", v: "" }]);
      setUpstream("");
      setStatus("done");
      router.refresh();
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Listing failed."} (The wrap config was stored — retry to finish listing.)`
      );
      setStatus("error");
    }
  }

  async function takeDown() {
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

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-foreground text-sm">
          Deploy a service — wrap any API, no server
        </div>
        {deployed && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">
            deployed · live
          </span>
        )}
      </div>
      <p className="mt-1 text-muted-foreground/70 text-xs">
        Wrap an API you hold a key for — t2000 hosts the proxy, your key is
        stored encrypted and only injected inside the paid flow (never shown
        again after you save). Buyers pay your price; delivery proxies to your
        upstream. Same as <span className="font-mono">t2 agent deploy</span>,
        signed by your Passport instead.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-muted-foreground/70 text-xs">
            Upstream URL (https) — the API your service calls
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
                Header name {i === 0 ? "(e.g. Authorization)" : ""}
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
                Value (write-only — encrypted at rest)
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
            onClick={() => setHeaders((rows) => [...rows, { k: "", v: "" }])}
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
            <option value="POST">POST</option>
            <option value="GET">GET</option>
          </select>
        </label>
        <label className="block">
          <span className="text-muted-foreground/70 text-xs">
            Price (USDC / call)
          </span>
          <input
            className={inputCls}
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.02"
            value={price}
          />
        </label>
        <label className="block sm:col-span-2">
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
          disabled={status === "storing" || status === "signing"}
          onClick={deploy}
          type="button"
        >
          {status === "storing"
            ? "Storing config…"
            : status === "signing"
              ? "Signing listing…"
              : deployed
                ? "Update deployment"
                : "Deploy & list"}
        </button>
        {deployed && (
          <button
            className="rounded-lg border border-border/60 px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-secondary disabled:opacity-50"
            disabled={status === "removing"}
            onClick={takeDown}
            type="button"
          >
            {status === "removing" ? "Removing…" : "Take it down"}
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
