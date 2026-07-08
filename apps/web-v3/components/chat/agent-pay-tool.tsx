"use client";

/**
 * Client half of the agent_pay store buy (SPEC_AGENT_COMMERCE §II.12 C2). The
 * server emits an `agent_pay` tool part (no server execute); this renders the
 * tap-to-confirm purchase card and, on Allow, runs the x402 sign-then-settle
 * loop IN-BROWSER via `agentPay` (zkLogin session key — pay-on-delivery,
 * auto-refund on failed delivery), then returns the delivered response +
 * digest to the agent with `addToolResult`. The user always confirms —
 * Passport "you decide".
 */

import { useState } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { useActiveChat } from "@/hooks/use-active-chat";
import type { ChatMessage } from "@/lib/types";
import { AGENT_PAY_CAP_USD, agentPay } from "@/lib/wallet/agent-pay";

type AgentPayPart = Extract<
  ChatMessage["parts"][number],
  { type: "tool-agent_pay" }
>;

export function AgentPayTool({ part }: { part: AgentPayPart }) {
  const { addToolResult } = useActiveChat();
  const [pending, setPending] = useState(false);
  const { toolCallId, state } = part;
  const widthClass = "w-[min(100%,450px)]";

  async function settle(output: unknown) {
    await addToolResult({
      tool: "agent_pay",
      toolCallId,
      output: output as never,
    });
  }

  if (state === "output-available") {
    const out = part.output as {
      digest?: string;
      refunded?: boolean;
      denied?: boolean;
      error?: string;
    };
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full">
          <ToolHeader state="output-available" type="tool-agent_pay" />
          <ToolContent>
            <div className="px-4 py-3 text-sm">
              {out?.denied && (
                <span className="text-muted-foreground">
                  Purchase declined.
                </span>
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
                    : `Purchase failed: ${out.error}`}
                  {out?.refunded && " Payment was refunded automatically."}
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
  if (!input?.seller || input.priceUsdc == null) {
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full" defaultOpen={true}>
          <ToolHeader state={state} type="tool-agent_pay" />
        </Tool>
      </div>
    );
  }

  const { seller, serviceName, priceUsdc } = input;

  const onAllow = async () => {
    // The executor re-validates (address shape, cap, session) fail-closed —
    // errors settle back to the agent so it explains instead of retrying.
    setPending(true);
    try {
      const result = await agentPay({
        seller,
        service: input.service,
        priceUsdc,
        input: input.input,
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
        <ToolHeader state={state} type="tool-agent_pay" />
        <ToolContent>
          <div className="px-4 pt-3 text-sm">
            <div className="font-medium">
              Buy: {serviceName ?? "Agent service"} · ${priceUsdc} USDC
            </div>
            <div className="mt-1 break-all text-muted-foreground text-xs">
              seller {seller}
            </div>
            <div className="mt-1 text-foreground">
              Pay on delivery — auto-refunds if the service fails. From your
              wallet USDC, gasless.
            </div>
            {priceUsdc > AGENT_PAY_CAP_USD && (
              <div className="mt-1 text-amber-600 text-xs">
                Over the ${AGENT_PAY_CAP_USD} in-chat cap — this will be
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
              {pending ? "Buying…" : `Allow & Pay $${priceUsdc}`}
            </button>
          </div>
        </ToolContent>
      </Tool>
    </div>
  );
}
