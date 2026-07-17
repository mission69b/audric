"use client";

/**
 * Client half of the pay_service confirm flow. The server emits a
 * `pay_service` tool part (no server execute); this renders the
 * tap-to-confirm card and, on Allow, resolves the endpoint from the live
 * catalog and runs the x402 pay loop IN-BROWSER via `payServiceCall`
 * (zkLogin session key), then returns the delivered response + digest to
 * the agent with `addToolResult`. The user always confirms — Passport
 * "you decide".
 */

import { useState } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { useActiveChat } from "@/hooks/use-active-chat";
import type { ChatMessage } from "@/lib/types";
import { PAY_SERVICE_CAP_USD, payServiceCall } from "@/lib/wallet/pay-service";

type PayServicePart = Extract<
  ChatMessage["parts"][number],
  { type: "tool-pay_service" }
>;

export function PayServiceTool({ part }: { part: PayServicePart }) {
  const { addToolResult } = useActiveChat();
  const [pending, setPending] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const { toolCallId, state } = part;
  const widthClass = "w-[min(100%,450px)]";

  async function settle(output: unknown) {
    await addToolResult({
      tool: "pay_service",
      toolCallId,
      output: output as never,
    });
  }

  if (state === "output-available") {
    const out = part.output as {
      digest?: string;
      direct?: boolean;
      denied?: boolean;
      error?: string;
    };
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full">
          <ToolHeader state="output-available" type="tool-pay_service" />
          <ToolContent>
            <div className="px-4 py-3 text-sm">
              {out?.denied && (
                <span className="text-muted-foreground">Payment declined.</span>
              )}
              {!out?.denied && out?.error && (
                <span
                  className={
                    /insufficient|balance/i.test(out.error)
                      ? "text-amber-600"
                      : "text-red-600"
                  }
                >
                  {/insufficient|balance/i.test(out.error)
                    ? "Your wallet needs more USDC for this — nothing was spent."
                    : `Call failed: ${out.error}`}
                </span>
              )}
              {!(out?.denied || out?.error) && out?.digest && (
                <span className="text-green-600">
                  Delivered ·{" "}
                  <a
                    className="font-mono text-xs underline underline-offset-2 hover:opacity-80"
                    href={`https://suiscan.xyz/mainnet/tx/${out.digest}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    title="Settlement receipt on-chain"
                  >
                    {out.digest.slice(0, 10)}… ↗
                  </a>
                </span>
              )}
            </div>
          </ToolContent>
        </Tool>
      </div>
    );
  }

  const input = part.input;
  if (!(input?.serviceId && input?.path) || input.priceUsdc == null) {
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full" defaultOpen={true}>
          <ToolHeader state={state} type="tool-pay_service" />
        </Tool>
      </div>
    );
  }

  const { serviceId, path, method, body, priceUsdc, purpose } = input;

  const onAllow = async () => {
    // The executor re-validates fail-closed (catalog resolution, live price,
    // cap, session) — errors settle back to the agent so it explains instead
    // of retrying.
    setPending(true);
    try {
      const result = await payServiceCall({
        serviceId,
        path,
        method,
        body,
        priceUsdc,
      });
      await settle(result);
    } catch (e) {
      await settle({ error: `${(e as Error).message}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={widthClass} key={toolCallId}>
      <Tool className="w-full" defaultOpen={true}>
        <ToolHeader state={state} type="tool-pay_service" />
        <ToolContent>
          <div className="px-4 pt-3 text-sm">
            <div className="font-medium">
              {purpose ?? "Paid API call"} · ${priceUsdc} USDC
            </div>
            <div className="mt-1 break-all font-mono text-muted-foreground text-xs">
              {serviceId} · {(method ?? "POST").toUpperCase()} {path}
            </div>
            <div className="mt-1 text-foreground">
              From your wallet USDC, gasless. The exact charge is the live
              catalog price — never above it.
            </div>
            {body && (
              <button
                className="mt-1 text-muted-foreground text-xs underline underline-offset-2"
                onClick={() => setShowBody((v) => !v)}
                type="button"
              >
                {showBody ? "Hide request" : "Show request"}
              </button>
            )}
            {body && showBody && (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                {body}
              </pre>
            )}
            {priceUsdc > PAY_SERVICE_CAP_USD && (
              <div className="mt-1 text-amber-600 text-xs">
                Over the ${PAY_SERVICE_CAP_USD} in-chat cap — this will be
                refused.
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 border-t px-4 py-3">
            <button
              className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              disabled={pending}
              onClick={() => settle({ denied: true })}
              type="button"
            >
              Deny
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              disabled={pending}
              onClick={onAllow}
              type="button"
            >
              {pending ? "Paying…" : `Allow & Pay $${priceUsdc}`}
            </button>
          </div>
        </ToolContent>
      </Tool>
    </div>
  );
}
