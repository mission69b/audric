"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ReasoningUIPart,
  type ToolUIPart,
} from "ai";
import { useMemo, useState } from "react";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  BundlePermissionCard,
  type BundlePermissionCardStep,
  PermissionCard,
  type PermissionCardModifiableField,
} from "@/components/audric/permission-card";
import { ToolResultRouter } from "@/components/audric/tool-result-router";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { Button } from "@/components/ui/button";
import {
  type SponsoredTxBundleStep,
  type SponsoredTxRequest,
  type SponsoredTxResult,
  sponsoredTx,
} from "@/lib/audric/sponsored-tx";
import { authFetch } from "@/lib/auth-fetch";
import type { ZkLoginSession } from "@/lib/zklogin";

/**
 * [Phase 5e] `data-audric-bundle` marker payload — the chat route emits
 * one per multi-write atomic Payment Intent. The shape MUST mirror
 * `AudricBundleMarker` exported from `app/(chat)/api/audric-chat/route.ts`
 * (same project, same module graph) — we re-declare here so the client
 * file doesn't import a server module. Drift caught at typecheck time
 * via the type bridge in `parseAudricBundleMarker`.
 */
interface AudricBundleMarkerData {
  steps: Array<{
    toolCallId: string;
    approvalId: string;
    toolName: string;
    input: Record<string, unknown>;
    description: string;
    modifiableFields: Array<{
      name: string;
      kind: string;
      asset?: string;
    }>;
  }>;
}

/**
 * Audric chat — client component.
 *
 * Phase 5c (S.181) — Timeline rendering via AI SDK v6 native primitives.
 * The legacy `BlockRouter` + 13 block types was structurally obsolete
 * because `UIMessage.parts` IS the ordered timeline. This client now uses
 * four template-shipped AI Elements end-to-end:
 *   - `<Conversation>` + `<ConversationContent>` — auto-stick-to-bottom
 *     scroll (use-stick-to-bottom).
 *   - `<Message from={role}>` + `<MessageContent>` — chat-bubble layout
 *     with role-based alignment (user → right, assistant → left).
 *   - `<MessageResponse>` (Streamdown) — markdown rendering for text
 *     parts (links, code, lists, math, mermaid).
 *   - `<Reasoning>` + `<ReasoningTrigger>` + `<ReasoningContent>` — the
 *     extended-thinking accordion ("Thinking..." while streaming →
 *     "Thought for N seconds" when done; auto-close 1s after stream
 *     ends). Streaming gate: `status === "streaming"` AND part is on
 *     the trailing message AND `part.state !== "done"`.
 *
 * Phase 3 Day 3c (S.175): replaced the JWT-textarea smoke surface with
 * the real zkLogin Google OAuth flow via `useZkLogin`. The chat panel
 * mounts only after the user is `authenticated` (full ZkLoginSession
 * present in localStorage) so the sponsored-tx flow has everything it
 * needs (ephemeral keypair + proof + maxEpoch) to sign on the user's
 * behalf — non-custodial.
 *
 * Day 3c also wires AI SDK's native HITL contract:
 *   - The chat route's `tool-input-available` parts carry `toolMetadata`
 *     with `{ description, modifiableFields, attemptId }` for any
 *     confirm-tier tool (today: `save_deposit`).
 *   - When AI SDK pauses on `needsApproval=true`, the assembled
 *     `ToolUIPart` enters state `'approval-requested'`. This component
 *     renders `<PermissionCard>` for those parts.
 *   - "Approve" runs `sponsoredSave` (prepare → sign locally → execute)
 *     then calls `addToolApprovalResponse({approved: true})` followed
 *     by `addToolOutput({tool, toolCallId, output})`. The
 *     `sendAutomaticallyWhen` hook then auto-fires the next turn so
 *     the LLM narrates the save without the user typing another
 *     message.
 *   - "Deny" calls `addToolApprovalResponse({approved: false, reason})`.
 *     AI SDK surfaces a `tool-output-denied` chunk to the model on the
 *     next turn so the LLM gracefully narrates the rejection.
 */
export function AudricChatClient() {
  const { status, session, error, login, logout } = useZkLogin();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  if (status === "redirecting") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Redirecting to Google…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6 text-zinc-100">
      <header className="flex items-center justify-between border-zinc-700 border-b pb-4">
        <div>
          <h1 className="font-semibold text-2xl">audric-chat</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Phase 3 canary — save_deposit via AI SDK HITL.{" "}
            {session && (
              <span className="font-mono text-xs">
                {session.address.slice(0, 8)}…{session.address.slice(-6)}
              </span>
            )}
          </p>
        </div>
        {session ? (
          <Button onClick={logout} variant="outline">
            Sign out
          </Button>
        ) : null}
      </header>

      {status === "expired" && (
        <div className="rounded border border-amber-700 bg-amber-950 p-3 text-amber-200 text-sm">
          Your session has expired. Please sign in again to continue.
        </div>
      )}

      {error && (
        <div className="rounded border border-red-700 bg-red-950 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {status === "authenticated" && session ? (
        <AudricChatPanel key={session.address} session={session} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-zinc-400">
            Sign in with Google to start chatting with Audric.
          </p>
          <Button
            onClick={() => {
              login().catch((err) => {
                console.error("[audric-chat] login failed:", err);
              });
            }}
            size="lg"
          >
            Continue with Google
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Inner chat panel — only ever mounted once the session is hydrated.
 *
 * `key={session.address}` re-mounts on user switch so the `useChat`
 * instance gets a clean slate per session (also sidesteps the v6
 * non-reactive-transport limitation we hit in Day 2c++).
 */
function AudricChatPanel({ session }: { session: ZkLoginSession }) {
  const [input, setInput] = useState<string>("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/audric-chat",
        headers: { "x-zklogin-jwt": session.jwt },
      }),
    [session.jwt]
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    addToolApprovalResponse,
    addToolOutput,
  } = useChat({
    transport,
    // Auto-fire the next turn once a tool-call has been answered
    // (output OR approval response). Without this the user would have
    // to type a follow-up message to get the LLM's narration of the
    // save result. AI SDK ships the canonical predicate.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const canSend = status === "ready" && input.trim().length > 0;

  // [Phase 5c] AI SDK v6 status === 'streaming' marks the in-flight turn.
  // Streaming reasoning parts ONLY appear in the last assistant message,
  // so we gate per-message: `Reasoning`'s auto-open/duration logic flips
  // on the trailing message and stays settled on every prior one.
  const lastMessageId = messages.at(-1)?.id;
  const isTurnStreaming = status === "streaming";

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent className="gap-3 p-0">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Ask &quot;what&apos;s my balance?&quot; or try &quot;save 0.01
              USDC&quot;.
            </p>
          ) : (
            messages.map((m) => {
              const isLast = m.id === lastMessageId;

              // [Phase 5e] Scan parts for `data-audric-bundle` markers and
              // build a Set of bundle-claimed toolCallIds. Bundle-claimed
              // tool-* parts are folded into one BundlePermissionCard
              // (rendered from the marker) instead of N individual cards.
              const bundleClaimedIds = new Set<string>();
              for (const part of m.parts) {
                if (part.type === "data-audric-bundle") {
                  const marker = parseAudricBundleMarker(
                    (part as { data?: unknown }).data
                  );
                  if (marker) {
                    for (const step of marker.steps) {
                      bundleClaimedIds.add(step.toolCallId);
                    }
                  }
                }
              }

              return (
                <Message from={m.role} key={m.id}>
                  <MessageContent>
                    {m.parts.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <MessageResponse
                            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                            key={`${m.id}-${i}`}
                          >
                            {part.text}
                          </MessageResponse>
                        );
                      }
                      if (part.type === "reasoning") {
                        const reasoningPart = part as ReasoningUIPart;
                        // The part is streaming only when (a) the turn is in
                        // flight, (b) it's on the trailing message, and (c)
                        // the part itself hasn't been marked done.
                        const partStreaming =
                          isTurnStreaming &&
                          isLast &&
                          reasoningPart.state !== "done";
                        return (
                          <Reasoning
                            isStreaming={partStreaming}
                            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                            key={`${m.id}-${i}`}
                          >
                            <ReasoningTrigger />
                            <ReasoningContent>
                              {reasoningPart.text}
                            </ReasoningContent>
                          </Reasoning>
                        );
                      }
                      // [Phase 5e] Bundle marker → ONE bundle card.
                      if (part.type === "data-audric-bundle") {
                        const marker = parseAudricBundleMarker(
                          (part as { data?: unknown }).data
                        );
                        if (!marker || marker.steps.length < 2) {
                          // Malformed marker — render nothing; the
                          // individual `tool-*` parts will render
                          // separately because they're NOT in
                          // bundleClaimedIds (the set is empty when
                          // parse fails for ALL markers).
                          return null;
                        }
                        return (
                          <BundleForMarker
                            addToolApprovalResponse={addToolApprovalResponse}
                            addToolOutput={addToolOutput}
                            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                            key={`${m.id}-${i}`}
                            marker={marker}
                            session={session}
                          />
                        );
                      }
                      if (part.type.startsWith("tool-")) {
                        const toolPart = part as ToolUIPart;
                        // [Phase 5e] Skip tool parts that a bundle marker
                        // claimed — the BundlePermissionCard handles
                        // them. AI SDK's state machine still tracks
                        // each part's approval-requested → output-*
                        // lifecycle independently (the parent's
                        // bundle approve handler fires N
                        // `addToolApprovalResponse` + N `addToolOutput`
                        // to keep each part's state in sync).
                        if (bundleClaimedIds.has(toolPart.toolCallId)) {
                          return null;
                        }
                        if (toolPart.state === "approval-requested") {
                          return (
                            <PermissionForToolPart
                              addToolApprovalResponse={addToolApprovalResponse}
                              addToolOutput={addToolOutput}
                              // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                              key={`${m.id}-${i}`}
                              session={session}
                              toolPart={toolPart}
                            />
                          );
                        }
                        return (
                          <ToolResultRouter
                            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                            key={`${m.id}-${i}`}
                            onSendMessage={(text) => sendMessage({ text })}
                            part={toolPart}
                          />
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
              );
            })
          )}
        </ConversationContent>
      </Conversation>

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
          placeholder="what's my balance? or 'save 0.01 USDC'"
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

interface PermissionForToolPartProps {
  addToolApprovalResponse: ReturnType<
    typeof useChat
  >["addToolApprovalResponse"];
  addToolOutput: ReturnType<typeof useChat>["addToolOutput"];
  session: ZkLoginSession;
  toolPart: ToolUIPart;
}

/**
 * Bridge between an AI-SDK-paused tool part and the audric
 * sponsored-tx flow. Extracts the audric metadata, the tool input, and
 * the approval id from the ToolUIPart, then wires the Approve / Deny
 * callbacks into the `useChat` HITL helpers.
 */
function PermissionForToolPart(props: PermissionForToolPartProps) {
  const { toolPart, session, addToolApprovalResponse, addToolOutput } = props;

  // `toolPart.type` is `tool-<name>` per AI SDK's UIMessagePart contract.
  const toolName = toolPart.type.startsWith("tool-")
    ? toolPart.type.slice("tool-".length)
    : toolPart.type;

  const metadata = parseAudricMetadata(toolPart.toolMetadata);
  if (!metadata) {
    // Shouldn't happen for any confirm-tier tool wired through the
    // server route — but render a graceful fallback so the user can
    // still deny if metadata went missing for any reason.
    return (
      <div className="my-3 rounded-lg border border-amber-700 bg-amber-950 p-4 text-amber-200 text-sm">
        Tool {toolName} requested approval but no metadata was attached.{" "}
        <Button
          onClick={() => {
            (async () => {
              try {
                await addToolApprovalResponse({
                  id: toolPart.approval?.id ?? "",
                  approved: false,
                  reason: "Missing metadata — auto-denied",
                });
                await addToolOutput({
                  tool: toolName,
                  toolCallId: toolPart.toolCallId,
                  state: "output-error",
                  errorText: "Auto-denied: missing tool metadata.",
                });
              } catch (err) {
                console.error("[audric-chat] auto-deny failed:", err);
              }
            })();
          }}
          size="sm"
          variant="outline"
        >
          Deny
        </Button>
      </div>
    );
  }

  const approvalId = toolPart.approval?.id;
  if (!approvalId) {
    return null;
  }

  return (
    <PermissionCard
      description={metadata.description}
      input={(toolPart.input ?? {}) as Record<string, unknown>}
      modifiableFields={metadata.modifiableFields}
      onApprove={async (modifiedInput) => {
        // 1. Tell AI SDK the user approved. Reason field is optional;
        // we omit it for the happy path.
        await addToolApprovalResponse({ id: approvalId, approved: true });

        // 2. Run the per-tool execution.
        //
        // [Phase 3 outcome-update slice / Phase 4 widening] Measure
        // the client-side execution wall time (Approve tap → result
        // returns) and stash it in `output.writeToolDurationMs`.
        // `/api/audric-chat` reads it off the resume turn's message
        // history and runs the cross-turn
        // `prisma.turnMetrics.updateMany({where: {attemptId}})` to
        // populate the row's `pendingActionOutcome` +
        // `writeToolDurationMs` fields (closes harness Spec §Item 3
        // G5 acceptance).
        const writeStartMs = Date.now();
        try {
          if (toolName === "save_contact") {
            // Server-only Prisma upsert (no on-chain tx).
            const result = await dispatchSaveContact(modifiedInput);
            await addToolOutput({
              tool: toolName,
              toolCallId: toolPart.toolCallId,
              output: {
                ...result,
                writeToolDurationMs: Date.now() - writeStartMs,
              },
            });
          } else {
            // The 9 sponsored writes — all flow through sponsoredTx.
            const request = buildSponsoredTxRequest(toolName, modifiedInput);
            if (!request) {
              throw new Error(
                `Unknown write tool ${toolName} — dispatch missing.`
              );
            }
            const result = await sponsoredTx({ ...request, session });
            await addToolOutput({
              tool: toolName,
              toolCallId: toolPart.toolCallId,
              output: buildToolOutput(
                request,
                result,
                Date.now() - writeStartMs
              ),
            });
          }
        } catch (err) {
          await addToolOutput({
            tool: toolName,
            toolCallId: toolPart.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : "Write tool failed",
          });
          throw err;
        }
      }}
      onDeny={async () => {
        await addToolApprovalResponse({
          id: approvalId,
          approved: false,
          reason: "User declined",
        });
        await addToolOutput({
          tool: toolName,
          toolCallId: toolPart.toolCallId,
          state: "output-error",
          errorText: "User denied the action.",
        });
      }}
      toolName={toolName}
    />
  );
}

// ---------------------------------------------------------------------------
// [Phase 5e — S.183] Bundle marker bridge — multi-write atomic Payment
// Intent. Maps the `data-audric-bundle` part's payload to a single
// `BundlePermissionCard` render + fans the single approve gesture out
// to N `addToolApprovalResponse` + 1 `sponsoredTx({type:'bundle'})` +
// N `addToolOutput` calls so AI SDK's per-tool state machine sees
// individual resolutions while the user experiences one signature.
// ---------------------------------------------------------------------------

interface BundleForMarkerProps {
  addToolApprovalResponse: ReturnType<
    typeof useChat
  >["addToolApprovalResponse"];
  addToolOutput: ReturnType<typeof useChat>["addToolOutput"];
  marker: AudricBundleMarkerData;
  session: ZkLoginSession;
}

/**
 * [Phase 5e] Bridge between a `data-audric-bundle` marker and the
 * audric sponsored-tx bundle flow. The marker carries everything the
 * card needs to render + everything the parent needs to dispatch back
 * to AI SDK and Sui (one signature, atomic PTB).
 */
function BundleForMarker(props: BundleForMarkerProps) {
  const { marker, session, addToolApprovalResponse, addToolOutput } = props;

  const steps: BundlePermissionCardStep[] = marker.steps.map((s) => ({
    toolCallId: s.toolCallId,
    approvalId: s.approvalId,
    toolName: s.toolName,
    input: s.input,
    description: s.description,
    modifiableFields: s.modifiableFields,
  }));

  return (
    <BundlePermissionCard
      onApprove={async () => {
        // 1. Tell AI SDK every step is approved. We fan out first so
        // the server doesn't block waiting on individual responses
        // while we run the sponsored-tx round-trip. Errors here are
        // unrecoverable for the bundle (a partial-approval state
        // confuses AI SDK's assembler), so we surface and abort.
        for (const step of steps) {
          await addToolApprovalResponse({
            id: step.approvalId,
            approved: true,
          });
        }

        // 2. Build the SponsoredTxBundleStep[] payload for one
        // sponsored-tx round-trip. Bundle MVP uses LLM-emitted input
        // verbatim — per-step modifiable editing is deferred.
        const bundleSteps: SponsoredTxBundleStep[] = steps.map((step) => ({
          toolName: step.toolName as SponsoredTxBundleStep["toolName"],
          input: step.input,
        }));

        const writeStartMs = Date.now();
        let result: SponsoredTxResult;
        try {
          result = await sponsoredTx({
            type: "bundle",
            steps: bundleSteps,
            session,
          });
        } catch (err) {
          // 3a. On dispatch failure: fan out N output-errors so AI
          // SDK's assembler can resolve every tool part and the
          // resume turn lets the LLM narrate the failure.
          const errorText =
            err instanceof Error ? err.message : "Bundle transaction failed";
          for (const step of steps) {
            await addToolOutput({
              tool: step.toolName,
              toolCallId: step.toolCallId,
              state: "output-error",
              errorText,
            });
          }
          throw err;
        }

        // 3b. On success: fan out N tool-outputs with the SAME digest +
        // balanceChanges. Sui PTBs return one digest + one combined
        // balance-change array for the whole tx; the LLM sees N
        // tool-results all referencing the same digest, which it
        // narrates as one atomic settlement ("Saved $X and swapped
        // $Y in one transaction · digest 0x...").
        const writeToolDurationMs = Date.now() - writeStartMs;
        for (const step of steps) {
          await addToolOutput({
            tool: step.toolName,
            toolCallId: step.toolCallId,
            output: {
              digest: result.digest,
              balanceChanges: result.balanceChanges,
              writeToolDurationMs,
              // Tag the per-step output with the bundle's identity so
              // downstream warehouse joins can split bundle vs single
              // resolutions when surfaced telemetry lands.
              partOfBundle: true,
              bundleStepCount: steps.length,
            },
          });
        }
      }}
      onDeny={async () => {
        // Symmetric fan-out — N approval-responses with approved=false
        // + N output-errors. Engine's resume turn sees structured
        // rejection per step and the LLM narrates a clean abort
        // ("Okay, I won't proceed with the bundle — let me know if
        // you want to do anything else").
        for (const step of steps) {
          await addToolApprovalResponse({
            id: step.approvalId,
            approved: false,
            reason: "User declined bundle",
          });
        }
        for (const step of steps) {
          await addToolOutput({
            tool: step.toolName,
            toolCallId: step.toolCallId,
            state: "output-error",
            errorText: "User denied the bundle.",
          });
        }
      }}
      steps={steps}
    />
  );
}

/**
 * [Phase 5e] Parse + validate a `data-audric-bundle` part's payload.
 * Mirrors `parseAudricMetadata` — gracefully degrade if a stale frame
 * ships a different shape, so the rest of the message still renders.
 */
function parseAudricBundleMarker(
  raw: unknown
): AudricBundleMarkerData | undefined {
  if (raw === null || typeof raw !== "object") {
    return;
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.steps)) {
    return;
  }
  const steps: AudricBundleMarkerData["steps"] = [];
  for (const s of obj.steps) {
    if (s === null || typeof s !== "object") {
      continue;
    }
    const step = s as Record<string, unknown>;
    if (
      typeof step.toolCallId !== "string" ||
      typeof step.approvalId !== "string" ||
      typeof step.toolName !== "string" ||
      typeof step.description !== "string" ||
      step.input === null ||
      typeof step.input !== "object" ||
      !Array.isArray(step.modifiableFields)
    ) {
      continue;
    }
    const modifiableFields = step.modifiableFields.filter(
      (f): f is { name: string; kind: string; asset?: string } =>
        f !== null &&
        typeof f === "object" &&
        typeof (f as Record<string, unknown>).name === "string" &&
        typeof (f as Record<string, unknown>).kind === "string"
    );
    steps.push({
      toolCallId: step.toolCallId,
      approvalId: step.approvalId,
      toolName: step.toolName,
      input: step.input as Record<string, unknown>,
      description: step.description,
      modifiableFields,
    });
  }
  if (steps.length === 0) {
    return;
  }
  return { steps };
}

/**
 * Validate + parse the `toolMetadata` blob we stamped server-side. We
 * intentionally don't use Zod here because the route owns the schema
 * and the round-trip is identity — but we still typecheck the shape
 * to gracefully degrade if a stale frame ships from an in-flight
 * deploy that wrote a different blob.
 */
function parseAudricMetadata(raw: unknown):
  | {
      description: string;
      modifiableFields: readonly PermissionCardModifiableField[];
    }
  | undefined {
  if (raw === null || typeof raw !== "object") {
    return;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.description !== "string") {
    return;
  }
  const fields = Array.isArray(obj.modifiableFields)
    ? obj.modifiableFields.filter(
        (f): f is PermissionCardModifiableField =>
          f !== null &&
          typeof f === "object" &&
          typeof (f as Record<string, unknown>).name === "string" &&
          typeof (f as Record<string, unknown>).kind === "string"
      )
    : [];
  return {
    description: obj.description,
    modifiableFields: fields,
  };
}

// ---------------------------------------------------------------------------
// Phase 4 dispatch helpers — convert engine tool name + input → the typed
// sponsoredTx request body (or a server-route call for the special cases).
// ---------------------------------------------------------------------------

/**
 * Map an engine tool name + modified input → the `SponsoredTxRequest`
 * shape that `lib/audric/sponsored-tx.ts` consumes. Each branch reads
 * the field names from the engine tool's `inputSchema` (defined in
 * `packages/engine/src/tools/<tool>.ts`).
 *
 * Returns `undefined` for tools that DON'T go through the sponsored-tx
 * flow (save_contact). The caller routes those elsewhere.
 *
 * `pay_api` is intentionally excluded from web-v2's tool set
 * (see Phase 4b deferral in `app/(chat)/api/audric-chat/route.ts`).
 */
function buildSponsoredTxRequest(
  toolName: string,
  input: Record<string, unknown>
): SponsoredTxRequest | undefined {
  switch (toolName) {
    case "save_deposit":
      return {
        type: "save",
        amount: Number(input.amount),
        asset: (input.asset as "USDC" | "USDsui" | undefined) ?? "USDC",
      };
    case "withdraw":
      return {
        type: "withdraw",
        amount: Number(input.amount),
        asset: (input.asset as "USDC" | "USDsui" | undefined) ?? "USDC",
      };
    case "borrow":
      return {
        type: "borrow",
        amount: Number(input.amount),
        asset: (input.asset as "USDC" | "USDsui" | undefined) ?? "USDC",
      };
    case "repay_debt":
      return {
        type: "repay",
        amount: Number(input.amount),
        asset: (input.asset as "USDC" | "USDsui" | undefined) ?? "USDC",
      };
    case "send_transfer":
      return {
        type: "send",
        amount: Number(input.amount),
        recipient: String(input.to ?? ""),
        asset: "USDC",
      };
    case "swap_execute":
      return {
        type: "swap",
        amount: Number(input.amount),
        from: String(input.from ?? ""),
        to: String(input.to ?? ""),
        ...(input.slippage === undefined
          ? {}
          : { slippage: Number(input.slippage) }),
        ...(input.byAmountIn === undefined
          ? {}
          : { byAmountIn: Boolean(input.byAmountIn) }),
      };
    case "claim_rewards":
      return { type: "claim-rewards" };
    case "harvest_rewards":
      return {
        type: "harvest",
        ...(input.slippage === undefined
          ? {}
          : { slippage: Number(input.slippage) }),
        ...(input.minRewardUsd === undefined
          ? {}
          : { minRewardUsd: Number(input.minRewardUsd) }),
      };
    case "volo_stake":
      // Engine tool's input field is `amountSui`; modifiable-fields
      // exposes it as `amount`. Accept either for forward-compat.
      return {
        type: "volo-stake",
        amount: Number(input.amountSui ?? input.amount),
      };
    case "volo_unstake": {
      // `amountVSui` can be the string `"all"` (engine tool's union
      // type). The client-side widget sends a number for editable
      // amounts; `0` means "all" by legacy convention.
      const raw = input.amountVSui ?? input.amount;
      const amount = raw === "all" ? 0 : Number(raw ?? 0);
      return { type: "volo-unstake", amount };
    }
    default:
      return;
  }
}

/**
 * Build the `addToolOutput` payload per tool. We pass back the
 * specific fields the LLM's narration prompt expects (`tx`, `amount`,
 * `from`, etc.) so the resume-turn narration reads as if the engine
 * itself had executed the write. Branches off `request.type` rather
 * than the tool name — same source of truth as `buildSponsoredTxRequest`.
 */
function buildToolOutput(
  request: SponsoredTxRequest,
  result: SponsoredTxResult,
  writeToolDurationMs: number
): Record<string, unknown> {
  const base = {
    success: true,
    tx: result.digest,
    balanceChanges: result.balanceChanges,
    writeToolDurationMs,
  };
  switch (request.type) {
    case "save":
    case "withdraw":
    case "borrow":
    case "repay":
      return {
        ...base,
        amount: request.amount,
        asset: request.asset ?? "USDC",
      };
    case "send":
      return {
        ...base,
        amount: request.amount,
        recipient: request.recipient,
        asset: request.asset ?? "USDC",
      };
    case "swap":
      return {
        ...base,
        amount: request.amount,
        from: request.from,
        to: request.to,
      };
    case "volo-stake":
    case "volo-unstake":
      return { ...base, amount: request.amount };
    default:
      // claim-rewards + harvest carry no amount in the request — the
      // balanceChanges array describes what actually moved.
      return base;
  }
}

/**
 * Dispatch save_contact through its server route. Returns a payload
 * shape the LLM can narrate ("Saved Alex (0x…) as a contact").
 *
 * Uses `authFetch` so the `x-zklogin-jwt` header lands on the request
 * — `/api/contacts/save` runs `getCurrentUser()` which reads the JWT
 * out of headers and 401s on miss. Pre-audit-pass this call used bare
 * `fetch`, which silently 401'd save_contact end-to-end (the
 * PermissionCard surfaced the error inline; the LLM never saw success).
 * Same JWT-bearing pattern the canvases use (see `lib/auth-fetch.ts`).
 */
async function dispatchSaveContact(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await authFetch("/api/contacts/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: String(input.name ?? ""),
      address: String(input.address ?? ""),
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `save_contact failed (${res.status})`);
  }
  return (await res.json()) as Record<string, unknown>;
}
