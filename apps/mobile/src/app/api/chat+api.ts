import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { productionGate } from "@/lib/api-guard";
import { systemPrompt } from "@/lib/ai/prompts";
import { webSearch } from "@/lib/ai/tools/web-search";
import {
  deleteChatById,
  saveChat,
  saveMessages,
  upsertUser,
} from "@/lib/db/queries";

// Expo Router API route — the mobile app's chat BFF, the native analogue of
// web-v3's `app/(chat)/api/chat/route.ts` core: take the UI messages, run
// `streamText` through the provider seam, and stream back a UI message stream that
// `useChat` on the device consumes. Runs SERVER-SIDE (Node) so the provider key
// never leaves the machine. DB / tools / auth / metering graft on HERE later,
// exactly as web-v3 layers them, without the client ever changing.

// Long-running turns (research/synthesis) can exceed a default timeout; keep parity
// with web-v3's generous budget once tools land. Plain text turns finish fast.
// NOTE: `maxDuration` is a Vercel serverless hint and may be ignored by other Expo
// Router server adapters — confirm the real request timeout on the deploy target.
export const maxDuration = 60;

// Coarse abuse guards. BEFORE DEPLOY: this route is currently an UNAUTHENTICATED
// provider-key proxy — before it is exposed beyond the local dev tunnel it MUST
// gain, to match web-v3's admission controls: (1) auth (the `audric_session`
// httpOnly cookie), (2) rate limiting, (3) a guest/free-tier quota, and (4) full
// Zod validation of the UIMessage shape (roles/parts/attachments). Today only these
// size caps stand between the key and a runaway/abusive caller.
const MAX_MESSAGES = 100;
const MAX_REQUEST_CHARS = 100_000;

// Identity/thread id shapes for persistence — mirror web-v3's uuid chat/message ids
// + the Sui-address user id. A turn is only persisted when BOTH are well-formed.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

// First user message's text, flattened + capped — the thread title (web-v3 titles
// a chat from its first turn too).
function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = (firstUser?.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
  return text.slice(0, 80) || "New chat";
}

export async function POST(req: Request) {
  // Phase-0 gate: refuse in production until real auth is wired (see api-guard).
  const gated = productionGate();
  if (gated) return gated;

  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      {
        error:
          "AI_GATEWAY_API_KEY is not set — add it to apps/mobile/.env.local (server-only, no EXPO_PUBLIC_ prefix) and restart the dev server.",
      },
      { status: 500 }
    );
  }

  let body: {
    id?: string;
    userId?: string;
    messages?: UIMessage[];
    selectedChatModel?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, selectedChatModel } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "No messages." }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return Response.json({ error: "Too many messages." }, { status: 413 });
  }
  if (JSON.stringify(messages).length > MAX_REQUEST_CHARS) {
    return Response.json({ error: "Request too large." }, { status: 413 });
  }

  // --- Persistence (web-v3 parity) ------------------------------------------
  // Save the thread + the incoming user turn BEFORE streaming; the assistant reply
  // saves in onFinish (below). Gated on a well-formed uuid chat id + Sui-address user
  // id — guests send neither, so they get no persistence, exactly like web-v3's
  // anonymous mode. Every DB call is best-effort: a failure is logged but NEVER
  // blocks the stream — the model response must not depend on the DB being reachable.
  const chatId = typeof body.id === "string" ? body.id : "";
  const userId =
    typeof body.userId === "string" ? body.userId.toLowerCase() : "";
  const canPersist =
    !!process.env.POSTGRES_URL &&
    UUID_RE.test(chatId) &&
    SUI_ADDRESS.test(userId);

  if (canPersist) {
    try {
      // Guarantee the FK target (User row) exists. Onboarding usually created it,
      // but a first turn can race that upsert — this makes the FK race-safe. Cheap +
      // idempotent.
      await upsertUser({ id: userId });
      await saveChat({ id: chatId, userId, title: deriveTitle(messages) });
      const last = messages.at(-1);
      if (last?.role === "user" && UUID_RE.test(last.id)) {
        await saveMessages([
          { id: last.id, chatId, role: "user", parts: last.parts, attachments: [] },
        ]);
      }
    } catch (error) {
      console.error("[chat route] persist(user turn) failed:", error);
    }
  }

  // Same composer web-v3's chat route uses. `web_search` is live, so we take the
  // tools branch (regularPrompt + aboutAudricPrompt + searchPrompt + request
  // hints). Geo hints are empty on native (no @vercel/functions). Memory / wallet
  // address / the wallet + artifact tools get passed here as they land (wallet is
  // Phase-0 gated), matching web-v3.
  const system = systemPrompt({
    requestHints: {},
    supportsTools: true,
    isAuthed: false,
  });

  const result = streamText({
    model: getLanguageModel(selectedChatModel),
    system,
    messages: await convertToModelMessages(messages),
    // Only the ungated, secret-free tool is wired so far. web-v3's DB/blob/wallet
    // tools (createDocument, generate_image, balance_check, send_transfer, …) need
    // a session + Neon/blob/Enoki and, for wallet, the Phase-0 gate — added later.
    tools: { web_search: webSearch },
    // Multi-step loop so the model can search then synthesize a cited answer (and
    // chain a couple of searches). web-v3 gives research turns a 12-step budget.
    stopWhen: stepCountIs(6),
    providerOptions: {
      // Zero Data Retention — route only to providers contractually bound not to
      // store or train on prompts, honoring the ZDR claim in `aboutAudricPrompt`.
      // Same flag web-v3 sets on every chat turn.
      gateway: { zeroDataRetention: true },
    },
  });

  // The UI message stream protocol `useChat` speaks — same as web-v3's
  // `toUIMessageStream()` + `createUIMessageStreamResponse()`, wrapped in one call.
  return result.toUIMessageStreamResponse({
    // Give the assistant message a real uuid id (the shape `Message_v2.id` needs, and
    // the same id the client adopts) so the reply persists + dedupes cleanly.
    generateMessageId: () => globalThis.crypto.randomUUID(),
    // Parity with web-v3's chat route (`toUIMessageStream({ sendReasoning, sendSources,
    // messageMetadata })`). Without these the interleaved-thinking models (Kimi K2.5,
    // the free default) and the `web_search` tool would still run, but their `reasoning`
    // + `source-*` parts would be stripped at the wire and never reach the device — so
    // the Chain-of-Thought "Thinking…" / "Searching…" timeline would have nothing to
    // render. Sources are also surfaced from the tool output; enabling them here keeps
    // the wire identical to web-v3.
    sendReasoning: true,
    sendSources: true,
    // Stamp the turn's start time + model on the message metadata (web-v3 does the same
    // on the `start` part) so the client can drive the CoT elapsed timer ("Thought for
    // Xs") and show which model answered. `Date.now()` is the turn boundary, matching
    // web-v3's `createdAt`.
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? { createdAt: Date.now(), modelId: selectedChatModel }
        : undefined,
    // Persist the assistant reply once the turn completes. Best-effort, same as the
    // user-turn save above — a DB failure here has already been streamed to the user.
    onFinish: async ({ responseMessage }) => {
      if (!canPersist) return;
      try {
        await saveMessages([
          {
            id: responseMessage.id,
            chatId,
            role: "assistant",
            parts: responseMessage.parts,
            attachments: [],
          },
        ]);
      } catch (error) {
        console.error("[chat route] persist(assistant turn) failed:", error);
      }
    },
    onError: (error) => {
      // Always log the full error server-side. In production return a FIXED message
      // (web-v3 does the same) so provider internals — request ids, upstream infra,
      // key hints — never reach the client. In dev, surface the real message to the
      // toast for debuggability.
      console.error("[chat route] stream error:", error);
      if (process.env.NODE_ENV === "production") {
        return "The model request failed. Please try again.";
      }
      return error instanceof Error ? error.message : "Model request failed.";
    },
  });
}

// Delete a thread from the drawer — `DELETE /api/chat?chatId=&userId=`. The query
// layer owner-checks (a thread is only removed if it belongs to this user), so a
// spoofed id can't delete someone else's chat. Same ⚠️ DEV TRUST MODEL as the other
// routes: identity is client-asserted for now and MUST come from the verified session
// cookie before exposure. No-ops cleanly when the DB is absent.
export async function DELETE(request: Request) {
  const gated = productionGate();
  if (gated) return gated;

  const params = new URL(request.url).searchParams;
  const chatId = params.get("chatId") ?? "";
  const userId = (params.get("userId") ?? "").toLowerCase();
  if (!UUID_RE.test(chatId) || !SUI_ADDRESS.test(userId)) {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  if (!process.env.POSTGRES_URL) {
    return Response.json({ ok: true, persisted: false });
  }
  try {
    await deleteChatById({ id: chatId, userId });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[chat route] delete failed:", error);
    return Response.json({ ok: false, error: "Delete failed." }, { status: 500 });
  }
}
