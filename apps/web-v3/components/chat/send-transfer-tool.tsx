"use client";

/**
 * Client half of the send_transfer money-write (Audric v3). The server emits a
 * `send_transfer` tool part (no server execute); this renders the tap-to-confirm
 * card and, on Allow, signs + submits IN-BROWSER via `sendTransfer` (zkLogin
 * session key), then returns the digest to the agent with `addToolResult`.
 * Built on the same Tool primitive as the rest of the tool UI. The user always
 * confirms — Passport "you decide".
 */

import { useState } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { useActiveChat } from "@/hooks/use-active-chat";
import type { ChatMessage } from "@/lib/types";
import { markSendDispatched, screenSend } from "@/lib/wallet/screen-write";
import { sendTransfer } from "@/lib/wallet/send";

type SendPart = Extract<
  ChatMessage["parts"][number],
  { type: "tool-send_transfer" }
>;

function lastUserText(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      return m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ");
    }
  }
  return;
}

export function SendTransferTool({ part }: { part: SendPart }) {
  const { addToolResult, messages } = useActiveChat();
  const [pending, setPending] = useState(false);
  const { toolCallId, state } = part;
  const widthClass = "w-[min(100%,450px)]";

  async function settle(output: unknown) {
    await addToolResult({
      tool: "send_transfer",
      toolCallId,
      output: output as never,
    });
  }

  if (state === "output-available") {
    const out = part.output as {
      digest?: string;
      denied?: boolean;
      error?: string;
    };
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full">
          <ToolHeader state="output-available" type="tool-send_transfer" />
          <ToolContent>
            <div className="px-4 py-3 text-sm">
              {out?.error &&
                (/insufficient/i.test(out.error) ? (
                  <span className="text-amber-600">
                    Your Passport needs more balance for this transfer — nothing
                    was sent.
                  </span>
                ) : (
                  <span className="text-red-600">Send failed: {out.error}</span>
                ))}
              {out?.denied && (
                <span className="text-muted-foreground">
                  Transfer declined.
                </span>
              )}
              {out?.digest && (
                <span className="text-green-600">
                  Sent ·{" "}
                  <span className="font-mono text-xs">
                    {out.digest.slice(0, 10)}…
                  </span>
                </span>
              )}
            </div>
          </ToolContent>
        </Tool>
      </div>
    );
  }

  const input = part.input;
  if (!input?.to || input.amount == null) {
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full" defaultOpen={true}>
          <ToolHeader state={state} type="tool-send_transfer" />
        </Tool>
      </div>
    );
  }

  const { to, amount } = input;
  const asset = input.asset ?? "USDC";

  const onAllow = async () => {
    // Host pre-dispatch screen (preflight + asset-intent + retry-dedup) — runs
    // before signing. On a block we settle with the reason so the agent re-asks
    // instead of moving money. The tap itself is the primary gate.
    const screen = screenSend(
      { to, amount, asset },
      {
        recentUserText: lastUserText(messages),
      }
    );
    if (!screen.ok) {
      await settle({ error: screen.reason });
      return;
    }

    setPending(true);
    try {
      const result = await sendTransfer({ to, amount, asset });
      markSendDispatched({ to, amount, asset });
      await settle(result);
    } catch (e) {
      await settle({ error: `${(e as Error).name}: ${(e as Error).message}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={widthClass} key={toolCallId}>
      <Tool className="w-full" defaultOpen={true}>
        <ToolHeader state={state} type="tool-send_transfer" />
        <ToolContent>
          <div className="px-4 pt-3 text-sm">
            <div className="font-medium">
              Send {amount} {asset}
            </div>
            <div className="mt-1 break-all text-muted-foreground text-xs">
              to {to}
            </div>
            <div className="mt-1 text-foreground">
              {asset === "SUI"
                ? "From your Passport (network fee applies)."
                : "From your Passport · gasless."}
            </div>
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
              {pending ? "Sending…" : "Allow & Send"}
            </button>
          </div>
        </ToolContent>
      </Tool>
    </div>
  );
}
