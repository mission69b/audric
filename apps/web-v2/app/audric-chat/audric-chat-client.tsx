"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ToolUIPart } from "ai";
import { useMemo, useState } from "react";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

/**
 * Minimal client component for /audric-chat.
 *
 * Day 2b shipped the smoke surface with a custom `<AudricToolPart>` (89 LoC).
 * Day 2c++ Batch 1 (S.172) swaps that for AI Elements `<Tool>` from the
 * vendored template (`components/ai-elements/tool.tsx`) — richer feature set
 * (collapsible state machine, approval lifecycle, error display, JSON
 * viewer) for 0 custom LoC. Architectural lock taken at Day 2c++ Batch 1:
 * new tools in web-v2 use AI Elements components; no custom tool renderers.
 *
 * --- WHY THE TWO-COMPONENT SPLIT ---
 *
 * Day 2b's original wiring passed a dynamic `transport` (undefined before
 * JWT, defined after) into `useChat`. The v6 `useChat` hook (`@ai-sdk/react`
 * 3.0.118) captures the transport at hook init and does NOT re-pick it up
 * when the prop changes. The original layout mounted `useChat` with
 * `transport: undefined`, then `sendMessage()` fell through to the AI SDK's
 * default `/api/chat` (a 400 mismatch with our schema). The Day 2c++ Batch 1
 * live smoke surfaced this on first browser test — curl never hit it
 * because curl bypasses `useChat`. Fix: extract the chat surface into a
 * child component that's only mounted once the JWT is set, guaranteeing
 * `useChat` initialises with a stable, defined transport. Phase 3 replaces
 * the JWT textarea with the real zkLogin Google OAuth flow, but that flow
 * also resolves to a stable JWT before mounting the chat panel, so this
 * structure carries forward.
 *
 * Two inputs:
 *   1. JWT textarea — pasted once, used as `x-zklogin-jwt` header on every
 *      fetch the transport sends.
 *   2. Message input — typical AI SDK v6 useChat input box.
 */
export function AudricChatClient() {
  const [jwt, setJwt] = useState<string>("");
  const trimmedJwt = jwt.trim();

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6 text-zinc-100">
      <header className="border-zinc-700 border-b pb-4">
        <h1 className="font-semibold text-2xl">audric-chat (Day 2c++)</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Minimal smoke surface for `/api/audric-chat` with
          <code className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5">
            balance_check
          </code>{" "}
          wired. Phase 3 replaces the JWT textarea with the real zkLogin Google
          OAuth flow.
        </p>
      </header>

      <section>
        <label
          className="mb-1 block font-medium text-sm text-zinc-300"
          htmlFor="jwt"
        >
          zkLogin JWT (paste a fresh JWT — same one a curl request would send
          via the <code>x-zklogin-jwt</code> header)
        </label>
        <textarea
          className="h-24 w-full rounded border border-zinc-700 bg-zinc-900 p-2 font-mono text-xs"
          id="jwt"
          onChange={(e) => setJwt(e.target.value)}
          placeholder="eyJhbGciOi..."
          value={jwt}
        />
      </section>

      {trimmedJwt ? (
        <AudricChatPanel jwt={trimmedJwt} key={trimmedJwt} />
      ) : (
        <p className="text-sm text-zinc-500">
          Paste a JWT above to enable sending.
        </p>
      )}
    </div>
  );
}

/**
 * Inner chat panel — only ever mounted once `jwt` is present.
 *
 * `transport` is `useMemo`'d on `jwt`, but because we re-mount via the
 * `key={trimmedJwt}` prop on the parent, every JWT change blows away the
 * `useChat` instance and gives a clean conversation state with the new
 * transport. That sidesteps the `useChat` non-reactive-transport
 * limitation entirely.
 */
function AudricChatPanel({ jwt }: { jwt: string }) {
  const [input, setInput] = useState<string>("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/audric-chat",
        headers: { "x-zklogin-jwt": jwt },
      }),
    [jwt]
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const canSend = status === "ready" && input.trim().length > 0;

  return (
    <>
      <section className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Ask &quot;what&apos;s my balance?&quot; below.
          </p>
        ) : (
          messages.map((m) => (
            <div className="space-y-2" key={m.id}>
              <div className="font-semibold text-xs text-zinc-400 uppercase">
                {m.role}
              </div>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <div
                      className="whitespace-pre-wrap text-sm"
                      // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                      key={`${m.id}-${i}`}
                    >
                      {part.text}
                    </div>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  const toolPart = part as ToolUIPart;
                  return (
                    <Tool
                      className="w-full"
                      defaultOpen={true}
                      // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                      key={`${m.id}-${i}`}
                    >
                      <ToolHeader state={toolPart.state} type={toolPart.type} />
                      <ToolContent>
                        {toolPart.input !== undefined && (
                          <ToolInput input={toolPart.input} />
                        )}
                        {(toolPart.output !== undefined ||
                          toolPart.errorText !== undefined) && (
                          <ToolOutput
                            errorText={toolPart.errorText}
                            output={toolPart.output}
                          />
                        )}
                      </ToolContent>
                    </Tool>
                  );
                }
                return null;
              })}
            </div>
          ))
        )}
      </section>

      <form
        className="flex gap-2 border-zinc-700 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) {
            return;
          }
          sendMessage({ text: input.trim() });
          setInput("");
        }}
      >
        <input
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          onChange={(e) => setInput(e.target.value)}
          placeholder="what's my balance?"
          value={input}
        />
        <button
          className="rounded bg-zinc-100 px-4 py-2 font-medium text-sm text-zinc-900 hover:bg-zinc-200 disabled:opacity-40"
          disabled={!canSend}
          type="submit"
        >
          send
        </button>
      </form>

      {error && (
        <div className="rounded border border-red-700 bg-red-950 p-3 text-red-200 text-sm">
          {error.message}
        </div>
      )}
    </>
  );
}
