"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import type { GatewayEndpoint } from "@/lib/gateway-services";
import {
  hasWalletSession,
  TRY_IT_CAP_USD,
  type TryResult,
  tryEndpoint,
} from "@/lib/try-service";

// The listing's "Use it" surface — the purged store's 4-tab pattern
// (S.608-era design, founder-requested back 2026-07-17) pointed at the MPP
// catalog instead of the deleted store escrow: Try it (browser, Passport
// pays) / Your agent (CLI + prompt) / Machines (x402/curl) / Audric (deep
// link). Client island on a public server-rendered page — the session lives
// in localStorage (same origin as /manage), so the page stays cache-friendly
// and this island decides its own state after hydration.

type TabId = "try" | "agent" | "machines" | "audric";

const TABS: { id: TabId; label: string }[] = [
  { id: "try", label: "Try it" },
  { id: "agent", label: "Your agent" },
  { id: "machines", label: "Machines" },
  { id: "audric", label: "Audric" },
];

type Phase = "idle" | "confirm" | "paying" | "done" | "error";

export function UseServiceTabs({
  serviceId,
  serviceName,
  serviceUrl,
  gatewayDocsUrl,
  direct,
  dialect,
  endpoints,
}: {
  /** Catalog id (mpp.t2000.ai) — keys the browser relay path. */
  serviceId: string;
  serviceName: string;
  /** The service's own origin (catalog serviceUrl) — CLI/curl calls go HERE. */
  serviceUrl: string;
  /** mpp.t2000.ai/services/<id> — full docs + schemas. */
  gatewayDocsUrl: string;
  direct: boolean;
  /** Direct sellers: the 402 dialect the gateway probed at ingest. */
  dialect?: "x402" | "mpp-header";
  endpoints: GatewayEndpoint[];
}) {
  const [tab, setTab] = useState<TabId>("try");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  // Browser-payable: priced under the cap AND a concrete path — templated
  // paths ({booking_id}) need a real id the browser form can't invent.
  const payable = endpoints.filter((e) => {
    const p = Number.parseFloat(e.price);
    return (
      Number.isFinite(p) &&
      p > 0 &&
      p <= TRY_IT_CAP_USD &&
      !e.path.includes("{")
    );
  });
  // Default to an endpoint with a known-good sample body (a first call
  // should never be a guessed, paid 4xx), cheapest as the tiebreak.
  const cheapest = [...payable].sort(
    (a, b) =>
      (b.sampleBody ? 1 : 0) - (a.sampleBody ? 1 : 0) ||
      Number.parseFloat(a.price) - Number.parseFloat(b.price)
  )[0];
  const [selected, setSelected] = useState<GatewayEndpoint | undefined>(
    cheapest
  );
  const [body, setBody] = useState(cheapest?.sampleBody ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<TryResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSignedIn(hasWalletSession());
  }, []);

  const settleCopy = direct
    ? "Settles straight to the seller's wallet — no automatic refund."
    : "Proxied through the gateway — no charge if the call fails.";

  // Passport is a zkLogin wallet: it can only safely pay x402 sellers (the
  // chain verifies the payer's signature). Header-dialect sellers verify a
  // personal-message signature THEMSELVES — zkLogin sigs fail that check
  // AFTER the payment settled (JMPR, 2026-07-17: charged, no delivery).
  // Fail closed on undefined (pre-stamp entries) — the SDK enforces the
  // same rule at pay time, this just keeps the dead-end button off the page.
  // INTENTIONAL KEEP: header-only sellers can no longer be LISTED (hard x402
  // gate at gateway ingest, S.749) — kept as defense-in-depth, do not sweep.
  const browserPayable = !direct || dialect === "x402";

  // Direct sellers rarely serve CORS headers, so browser calls go through
  // the gateway's catalog-pinned pass-through relay (the payment still
  // settles client → seller). CLI/curl callers use the seller origin.
  const browserBase = direct
    ? `https://mpp.t2000.ai/api/relay/${serviceId}`
    : serviceUrl;

  const first = cheapest ?? payable[0] ?? endpoints[0];
  const cliCommand = first
    ? `t2 pay ${serviceUrl}${first.path} --method ${first.method}${
        first.sampleBody ? ` --data '${first.sampleBody}'` : ""
      } --max-price ${first.price}`
    : `t2 pay ${serviceUrl}`;
  const agentPrompt = `Use the paid API at ${serviceUrl} (${serviceName}). Fetch its OpenAPI at ${serviceUrl}/openapi.json for endpoints + request schemas, then pay per call with the t2000 wallet (t2000_pay / t2 pay), max price $${first?.price ?? "0.10"} per call.`;
  // Names the tool + the query explicitly — "the catalog" alone lets weaker
  // models skip the lookup and claim the service doesn't exist (Kimi K2.5,
  // founder dogfood 2026-07-20).
  const audricDraft = `Call your find_paid_services tool with the query "${serviceName}", then use that service for me — offer me the price first.`;

  const onPay = async () => {
    if (!selected) {
      return;
    }
    setPhase("paying");
    setError("");
    try {
      const r = await tryEndpoint({
        url: `${browserBase}${selected.path}`,
        method: selected.method,
        body: body.trim() || undefined,
        priceUsdc: selected.price,
      });
      setResult(r);
      if (r.error) {
        setError(r.error);
        setPhase("error");
      } else {
        setPhase("done");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
      setPhase("error");
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border/50">
      <div className="flex items-center gap-1 border-border/50 border-b bg-card/40 px-3 py-2.5">
        {TABS.map((t) => (
          <button
            className={`rounded-md px-3.5 py-1.5 font-medium text-[12.5px] transition-colors ${
              tab === t.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "try" && !browserPayable && (
          <div>
            <div className="font-medium text-foreground text-sm">
              Not payable from a browser wallet yet
            </div>
            <p className="mt-1 max-w-prose text-fg-muted text-xs leading-relaxed">
              This seller only accepts the MPP header payment dialect, which
              browser Passport (zkLogin) wallets can't safely pay — the seller
              can't verify the payment signature, so the charge would settle
              without the service delivering. Pay it from a keypair wallet
              instead: the CLI or your agent (next tab), or ask the seller to
              add x402 support.
            </p>
            <button
              className="ag-btn ag-btn--primary ag-btn--sm mt-3"
              onClick={() => setTab("agent")}
              type="button"
            >
              Use it from your agent instead
            </button>
          </div>
        )}

        {tab === "try" && browserPayable && (
          <div>
            {payable.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No endpoint under the ${TRY_IT_CAP_USD} in-browser cap — use the
                CLI instead.
              </p>
            )}

            {payable.length > 0 && signedIn === false && (
              <div>
                <div className="font-medium text-foreground text-sm">
                  Try it in the browser
                </div>
                <p className="mt-1 text-fg-muted text-xs">
                  Sign in with Google to pay from your Passport wallet (USDC,
                  gasless) and see the response right here. {settleCopy}
                </p>
                <Link
                  className="ag-btn ag-btn--primary ag-btn--sm mt-3"
                  href="/manage"
                >
                  Sign in to try it
                </Link>
              </div>
            )}

            {payable.length > 0 && signedIn && (
              <div>
                <label
                  className="block text-fg-subtle text-xs"
                  htmlFor="try-endpoint"
                >
                  Endpoint
                </label>
                <select
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-[12.5px] text-foreground"
                  id="try-endpoint"
                  onChange={(e) => {
                    const next = payable.find(
                      (p) => `${p.method} ${p.path}` === e.target.value
                    );
                    setSelected(next);
                    setBody(next?.sampleBody ?? "");
                    setPhase("idle");
                    setResult(null);
                  }}
                  value={
                    selected ? `${selected.method} ${selected.path}` : undefined
                  }
                >
                  {payable.map((e) => (
                    <option
                      key={`${e.method} ${e.path}`}
                      value={`${e.method} ${e.path}`}
                    >
                      {e.method} {e.path} — ${e.price}
                    </option>
                  ))}
                </select>

                {selected && selected.method !== "GET" && (
                  <>
                    <label
                      className="mt-3 block text-fg-subtle text-xs"
                      htmlFor="try-body"
                    >
                      Request body (edit before paying)
                    </label>
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-[12px] text-foreground"
                      id="try-body"
                      onChange={(e) => setBody(e.target.value)}
                      spellCheck={false}
                      value={body}
                    />
                  </>
                )}

                <p className="mt-2 text-fg-muted text-xs">
                  Pays ${selected?.price} USDC from your Passport wallet,
                  gasless. {settleCopy}
                </p>

                {phase === "idle" && (
                  <button
                    className="ag-btn ag-btn--primary mt-3"
                    onClick={() => setPhase("confirm")}
                    type="button"
                  >
                    Try it — ${selected?.price}
                  </button>
                )}

                {phase === "confirm" && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border/60 p-3">
                    <span className="text-foreground text-sm">
                      Pay{" "}
                      <span className="font-semibold">
                        ${selected?.price} USDC
                      </span>{" "}
                      to {serviceName}?
                    </span>
                    <button
                      className="ag-btn ag-btn--primary ag-btn--sm"
                      onClick={onPay}
                      type="button"
                    >
                      Confirm — pay ${selected?.price}
                    </button>
                    <button
                      className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
                      onClick={() => setPhase("idle")}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {phase === "paying" && (
                  <p className="mt-3 text-muted-foreground text-sm">
                    Signing + paying… the response arrives in the same round
                    trip.
                  </p>
                )}

                {phase === "done" && result && (
                  <div className="mt-3">
                    <div className="font-mono text-emerald-500 text-xs">
                      ✓ Delivered{result.digest ? " · settled on Sui" : ""}
                    </div>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-border/50 bg-background p-3 font-mono text-muted-foreground text-xs leading-relaxed">
                      {typeof result.response === "string"
                        ? result.response
                        : JSON.stringify(result.response, null, 2)}
                    </pre>
                    {result.digest && (
                      <a
                        className="mt-2 inline-block text-fg-muted text-xs underline underline-offset-4 hover:text-foreground"
                        href={`https://suiscan.xyz/mainnet/tx/${result.digest}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View the settlement tx ↗
                      </a>
                    )}
                  </div>
                )}

                {phase === "error" && (
                  <div className="mt-3 text-sm">
                    <p className="text-destructive">{error}</p>
                    {error.toLowerCase().includes("balance") && (
                      <p className="mt-1 text-fg-muted text-xs">
                        Your wallet needs USDC on Sui —{" "}
                        <Link
                          className="underline underline-offset-4"
                          href="/manage"
                        >
                          see your deposit address
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "agent" && (
          <div>
            <div className="text-fg-subtle text-xs">
              One command from any terminal (no signup — the wallet IS the
              account):
            </div>
            <code className="mt-1.5 block overflow-x-auto whitespace-nowrap rounded-lg border border-border/50 bg-background p-3 font-mono text-[12px] text-foreground">
              {cliCommand}
            </code>
            <div className="mt-2">
              <CopyButton label="Copy command" text={cliCommand} />
            </div>
            <div className="mt-4 text-fg-subtle text-xs">
              Or paste this into your agent (Claude Code, Cursor, any MCP client
              with the t2000 wallet):
            </div>
            <p className="mt-1.5 rounded-lg border border-border/50 bg-background p-3 text-[12.5px] text-muted-foreground leading-relaxed">
              {agentPrompt}
            </p>
            <div className="mt-2">
              <CopyButton label="Copy prompt" text={agentPrompt} />
            </div>
          </div>
        )}

        {tab === "machines" && (
          <div>
            <div className="text-fg-subtle text-xs">
              Raw x402: request → 402 challenge → pay in USDC on Sui → same
              request settles. Any x402 client works.
            </div>
            <code className="mt-1.5 block overflow-x-auto whitespace-pre rounded-lg border border-border/50 bg-background p-3 font-mono text-[12px] text-foreground">
              {`curl -sX ${first?.method ?? "POST"} ${serviceUrl}${first?.path ?? ""} \\
  -H 'content-type: application/json'${first?.sampleBody ? ` \\\n  -d '${first.sampleBody}'` : ""}
# → 402 with the payment challenge; pay it and retry.`}
            </code>
            <a
              className="mt-3 inline-block text-[12.5px] text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
              href={gatewayDocsUrl}
              rel="noreferrer"
              target="_blank"
            >
              Full docs, request schemas + prices on the gateway →
            </a>
          </div>
        )}

        {tab === "audric" && (
          <div>
            <div className="text-fg-subtle text-xs">
              Ask Audric — it finds the service in the catalog, quotes the
              price, and pays from your Passport after you tap to confirm.
            </div>
            <p className="mt-1.5 rounded-lg border border-border/50 bg-background p-3 text-[12.5px] text-muted-foreground leading-relaxed">
              {audricDraft}
            </p>
            <a
              className="ag-btn ag-btn--primary ag-btn--sm mt-3 inline-flex"
              href={`https://audric.ai/?draft=${encodeURIComponent(audricDraft)}`}
              rel="noreferrer"
              target="_blank"
            >
              Open in Audric ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
