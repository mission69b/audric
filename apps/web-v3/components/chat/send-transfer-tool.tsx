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

/**
 * Money-safety (address-source guard). Is this recipient one the USER actually
 * provided — typed/pasted the 0x, gave a name we resolved via resolve_suins, or
 * already confirmed a send to it this conversation? If NOT, the address is
 * model-originated — a hallucination risk (2026-06-25 incident: the agent
 * invented a recipient on an unrelated turn). We don't hard-block (a legit
 * address could be phrased in a way the scan misses) — we warn loudly so the
 * send is a deliberate, eyes-open action, not a casual tap.
 */
function recipientWasUserProvided(
  messages: ChatMessage[],
  to: string
): boolean {
  const needle = to.toLowerCase();
  for (const m of messages) {
    for (const part of m.parts) {
      const p = part as {
        type?: string;
        text?: string;
        output?: unknown;
        input?: { to?: string };
        state?: string;
      };
      // 1. The user typed or pasted the address.
      if (
        m.role === "user" &&
        p.type === "text" &&
        p.text?.toLowerCase().includes(needle)
      ) {
        return true;
      }
      // 2. resolve_suins turned a name/handle the USER gave into this address.
      if (
        p.type === "tool-resolve_suins" &&
        p.output != null &&
        JSON.stringify(p.output).toLowerCase().includes(needle)
      ) {
        return true;
      }
      // 3. The user already CONFIRMED a send to this address this conversation.
      if (
        p.type === "tool-send_transfer" &&
        p.state === "output-available" &&
        (p.output as { digest?: string } | undefined)?.digest &&
        p.input?.to?.toLowerCase() === needle
      ) {
        return true;
      }
    }
  }
  return false;
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
                  <a
                    className="font-mono text-xs underline underline-offset-2 hover:opacity-80"
                    href={`https://suiscan.xyz/mainnet/tx/${out.digest}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    title="Verify on-chain"
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
  // Address-source guard: warn when the recipient didn't come from the user.
  const userProvided = recipientWasUserProvided(messages, to);

  const onAllow = async () => {
    // Host pre-dispatch screen (preflight + retry-dedup) — runs before signing.
    // On a block we settle with the reason so the agent re-asks instead of
    // moving money. The tap itself is the primary gate.
    const screen = screenSend({ to, amount, asset });
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
              From your Passport · gasless.
            </div>
            {!userProvided && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[12px] text-amber-700 dark:text-amber-400">
                ⚠️ This address wasn't in your messages — Audric may have
                generated it. Only send if you recognize it.
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
              className={`rounded-md px-3 py-1.5 text-primary-foreground text-sm transition-colors disabled:opacity-50 ${
                userProvided
                  ? "bg-primary hover:bg-primary/90"
                  : "bg-amber-600 hover:bg-amber-600/90"
              }`}
              disabled={pending}
              onClick={onAllow}
              type="button"
            >
              {pending
                ? "Sending…"
                : userProvided
                  ? "Allow & Send"
                  : "Send anyway"}
            </button>
          </div>
        </ToolContent>
      </Tool>
    </div>
  );
}
