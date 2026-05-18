"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";
import { AudricToolPart } from "@/components/audric/tool-part";

/**
 * Minimal client component for /audric-chat (Day 2b smoke surface).
 *
 * Two inputs:
 *   1. JWT textarea — pasted once, used as `x-zklogin-jwt` header on
 *      every fetch the transport sends. Phase 3 replaces this with the
 *      real ZkLogin Google OAuth flow.
 *   2. Message input — typical AI SDK v6 useChat input box.
 *
 * Renderer switches on `part.type`:
 *   - `text` parts render their `.text`.
 *   - `tool-*` parts render via <AudricToolPart>.
 *   - All other parts (step-start, reasoning, etc.) are ignored for
 *     Day 2b. Phase 5 wires the rich renderer.
 */
export function AudricChatClient() {
  const [jwt, setJwt] = useState<string>("");
  const [input, setInput] = useState<string>("");

  const transport = useMemo(() => {
    if (!jwt.trim()) {
      return;
    }
    return new DefaultChatTransport({
      api: "/api/audric-chat",
      headers: { "x-zklogin-jwt": jwt.trim() },
    });
  }, [jwt]);

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const canSend = !!transport && status === "ready" && input.trim().length > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6 text-zinc-100">
      <header className="border-zinc-700 border-b pb-4">
        <h1 className="font-semibold text-2xl">audric-chat (Day 2b)</h1>
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

      <section className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Paste a JWT, then ask &quot;what&apos;s my balance?&quot; below.
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
                  const toolName = part.type.slice("tool-".length);
                  const toolPart = part as unknown as {
                    state: string;
                    input?: unknown;
                    output?: unknown;
                    errorText?: string;
                  };
                  return (
                    <AudricToolPart
                      errorText={toolPart.errorText}
                      input={toolPart.input}
                      // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                      key={`${m.id}-${i}`}
                      output={toolPart.output}
                      state={toolPart.state}
                      toolName={toolName}
                    />
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
          disabled={!transport}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            transport
              ? "what's my balance?"
              : "paste a JWT above to enable sending"
          }
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
    </div>
  );
}
