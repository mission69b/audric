"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Segmented } from "@/components/segmented";
import {
  deploySelfConfig,
  removeSelfDeploy,
  type WrapConfig,
} from "@/lib/deploy-self";
import { updateSelfService } from "@/lib/update-self-service";

// The service block on /manage/agents/[address] (t2000-design/agents
// EditListing §ServiceDeployBlock). ONE card (S.639): where the compute
// lives is a segmented toggle — self-hosted endpoint vs a wrapped API
// (t2000 hosts the proxy, keys encrypted). S.657: the live wrap's
// non-secret config prefills the form (header VALUES stay write-only —
// leave one blank to keep the saved secret).
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

type HeaderRow = { k: string; v: string; saved?: boolean };
type Mode = "self" | "wrap";

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
  currentWrap,
}: {
  address: string;
  mcpEndpoint: string | null;
  priceUsdc: string | null;
  category: string | null;
  /** The live wrap's non-secret config (server-read) — null when none. */
  currentWrap?: WrapConfig | null;
}) {
  const router = useRouter();
  const buyUrl = `${RAIL_BASE}/commerce/pay/${address}`;
  const isWrapped = mcpEndpoint === buyUrl;
  const isLive = Boolean(mcpEndpoint);

  const [mode, setMode] = useState<Mode>(isWrapped ? "wrap" : "self");
  // Self-hosted fields
  const [endpoint, setEndpoint] = useState(
    isWrapped ? "" : (mcpEndpoint ?? "")
  );
  // Wrap fields — prefilled from the live config; header values write-only.
  const [upstream, setUpstream] = useState(currentWrap?.upstreamUrl ?? "");
  const [method, setMethod] = useState<"GET" | "POST">(
    currentWrap?.method ?? "POST"
  );
  const [headers, setHeaders] = useState<HeaderRow[]>(
    currentWrap?.headerNames.length
      ? currentWrap.headerNames.map((k) => ({ k, v: "", saved: true }))
      : [{ k: "", v: "" }]
  );
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

  // Removing a SAVED row drops that header from the config on the next
  // save (the gateway stores exactly the names sent).
  function removeHeader(i: number) {
    setHeaders((rows) => {
      const next = rows.filter((_, idx) => idx !== i);
      return next.length ? next : [{ k: "", v: "" }];
    });
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
        // Empty value on a SAVED header = keep the stored secret (the
        // gateway merges); rows without a name are dropped.
        const headerMap = Object.fromEntries(
          headers
            .filter((r) => r.k.trim() && (r.v.trim() || r.saved))
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
        // Secrets are write-only: clear entered values, keep the names.
        setHeaders((rows) =>
          rows
            .filter((r) => r.k.trim())
            .map((r) => ({ k: r.k, v: "", saved: true }))
        );
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

  async function takeDown() {
    setError("");
    setStatus("removing");
    if (isWrapped) {
      const removed = await removeSelfDeploy();
      if (!removed.ok) {
        setError(removed.message);
        setStatus("error");
        return;
      }
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
    <div className="ag-card grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-[14.5px] text-foreground">
            Sell a service as this Passport
          </div>
          <div className="mt-[3px] max-w-[440px] text-[12px] text-fg-muted leading-[1.5]">
            Buyers pay per call — escrowed, auto-refund on failed delivery.
            Where does the service run?{" "}
            <a
              className="text-foreground underline underline-offset-4"
              href="https://developers.t2000.ai/commerce/sell"
              rel="noreferrer"
              target="_blank"
            >
              Which one? ↗
            </a>
          </div>
        </div>
        {isLive && (
          <span className="ag-verified px-2.5 py-0.5">
            <span className="ag-dot" style={{ width: 5, height: 5 }} /> Live
          </span>
        )}
      </div>

      <Segmented
        onChange={setMode}
        options={[
          { id: "self", label: "I host an endpoint" },
          { id: "wrap", label: "Wrap an API — no server" },
        ]}
        value={mode}
      />

      {mode === "self" ? (
        <label className="grid gap-[7px]">
          <FieldLabel>Your service endpoint (https) — empty delists</FieldLabel>
          <input
            className="ag-input"
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://my-agent.example/svc/9f2ce81a"
            value={endpoint}
          />
          <Hint>
            Delivery contract + a 25-line example:{" "}
            <a
              className="text-fg-muted"
              href="https://developers.t2000.ai/commerce/sell"
              rel="noreferrer"
              target="_blank"
            >
              developers.t2000.ai/commerce/sell ↗
            </a>
          </Hint>
        </label>
      ) : (
        <>
          <label className="grid gap-[7px]">
            <FieldLabel>Upstream URL (https)</FieldLabel>
            <input
              className="ag-input"
              onChange={(e) => setUpstream(e.target.value)}
              placeholder="https://api.example.com/v1/endpoint"
              value={upstream}
            />
            <Hint>
              The API your service calls. Your key is stored encrypted, injected
              only inside the paid flow, never shown again.
            </Hint>
          </label>
          {headers.map((row, i) => (
            <div
              className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
              key={`header-${i.toString()}`}
            >
              <label className="grid gap-[7px]">
                <FieldLabel>Header name (optional)</FieldLabel>
                <input
                  className="ag-input"
                  onChange={(e) => setHeader(i, "k", e.target.value)}
                  placeholder="Authorization"
                  value={row.k}
                />
              </label>
              <label className="grid gap-[7px]">
                <FieldLabel>Value (write-only)</FieldLabel>
                <input
                  className="ag-input"
                  onChange={(e) => setHeader(i, "v", e.target.value)}
                  placeholder={
                    row.saved ? "•••• saved — enter to replace" : "Bearer sk-…"
                  }
                  type="password"
                  value={row.v}
                />
              </label>
              <button
                aria-label="Remove header"
                className="flex h-10 w-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:text-foreground"
                onClick={() => removeHeader(i)}
                title="Remove header"
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="14"
                  viewBox="0 0 16 16"
                  width="14"
                >
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            </div>
          ))}
          <button
            className="w-fit text-fg-muted text-xs underline underline-offset-4 transition-colors hover:text-foreground"
            onClick={() => setHeaders((rows) => [...rows, { k: "", v: "" }])}
            type="button"
          >
            + add header
          </button>
          <label className="grid gap-[7px]">
            <FieldLabel>Method</FieldLabel>
            <select
              className="ag-input"
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
          <Hint>You receive the net after the 2.5% platform fee.</Hint>
        </label>
        <label className="grid content-start gap-[7px]">
          <FieldLabel>Store category</FieldLabel>
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
          {status === "busy"
            ? "Saving…"
            : mode === "wrap" && !isWrapped
              ? "Deploy & list"
              : "Save service"}
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
