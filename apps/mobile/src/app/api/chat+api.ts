import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { authenticate } from "@/lib/api-guard";
import { systemPrompt } from "@/lib/ai/prompts";
import { balanceCheck } from "@/lib/ai/tools/balance-check";
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

// Coarse abuse guards. Auth is now wired (a verified `audric_session` Bearer — see
// `authenticate`), so the provider key is no longer an open proxy. To reach full
// parity with web-v3's admission controls this route STILL needs: (1) rate limiting,
// (2) a guest/free-tier quota, and (3) full Zod validation of the UIMessage shape
// (roles/parts/attachments). Today auth + these size caps stand between the key and a
// runaway/abusive caller.
const MAX_MESSAGES = 100;
// Text/tool content budget — a tight abuse guard on the prose payload. Measured
// WITHOUT image attachments (those are base64 `data:` URLs, megabytes each, and get
// their own budget below — folding them in here would 413 every legitimate photo).
const MAX_REQUEST_CHARS = 100_000;
// Attachment budget (base64 chars). The client allows up to MAX_ATTACHMENTS(4)
// files, each ≤ MAX_PDF_BYTES(10 MB) decoded (`lib/attachments.ts`); base64 is ~4/3
// of that, so the worst case (4 max-size PDFs) is ~55 M chars — this clears it with
// headroom. A backstop only: the client enforces the real per-file cap before send.
const MAX_ATTACHMENT_CHARS = 60_000_000;
// Mirrors the sheet's own 2000-char cap (`lib/prefs.ts`).
const MAX_CUSTOM_INSTRUCTIONS = 2000;

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

// Image attachments are inlined as base64 `data:` URLs (mobile has no blob store),
// so a single image `file` part can be several MB. Persisting that verbatim would
// bloat the Message_v2 row — web-v3 stores a short private-blob URL, never the bytes.
// For STORAGE ONLY, swap each image file part for a lightweight text marker; the live
// turn still streams the real bytes to the model (that path reads `messages`, which is
// never touched here). Tradeoff: a reloaded thread shows "[image: name]" instead of the
// photo — re-inlining old images needs a blob store (post-beta), the same problem
// web-v3 solves with private blobs. Non-image parts pass through unchanged.
function partsForPersist(parts: UIMessage["parts"]): UIMessage["parts"] {
  return parts.map((part) => {
    const mediaType = (part as { mediaType?: string }).mediaType;
    if (part.type === "file" && mediaType?.startsWith("image/")) {
      const name = (part as { filename?: string }).filename ?? "attachment";
      return { type: "text", text: `[image: ${name}]` };
    }
    // Any other file (PDF today; more types later) is inlined base64 too (megabytes)
    // and isn't re-openable from the DB — same treatment as images: persist a light
    // marker, not the bytes. Generic "[file: …]" so a new type needs no change here.
    if (part.type === "file") {
      const name = (part as { filename?: string }).filename ?? "document";
      return { type: "text", text: `[file: ${name}]` };
    }
    return part;
  });
}

// --- PDF attachments ---------------------------------------------------------
// A raw application/pdf `file` part 500s the Gateway on the open models, so we NEVER
// forward one: extract the text server-side with unpdf and swap the file part for a
// labeled text part. Images are left untouched (the vision models read the base64
// inline). Runs ONLY on the messages fed to the model — persistence uses the marker
// path above.
const PDF_TEXT_MAX_CHARS = 100_000;

async function prepareAttachments(messages: UIMessage[]): Promise<UIMessage[]> {
  let touched = false;
  const out = await Promise.all(
    messages.map(async (msg) => {
      if (msg.role !== "user") return msg;
      let changed = false;
      const parts = await Promise.all(
        (msg.parts ?? []).map(async (part) => {
          const mediaType = (part as { mediaType?: string }).mediaType;
          const url = (part as { url?: string }).url;
          if (
            part.type !== "file" ||
            mediaType !== "application/pdf" ||
            typeof url !== "string"
          ) {
            return part;
          }
          const name = (part as { filename?: string }).filename ?? "document.pdf";
          const text = await extractPdfText(url).catch((error) => {
            console.error("[chat route] pdf extract failed:", error);
            return "";
          });
          changed = true;
          const body = text.trim()
            ? text.slice(0, PDF_TEXT_MAX_CHARS)
            : "(No extractable text — the PDF may be scanned images.)";
          return { type: "text" as const, text: `<pdf name="${name}">\n${body}\n</pdf>` };
        })
      );
      if (changed) touched = true;
      return changed
        ? ({ ...msg, parts: parts as UIMessage["parts"] } as UIMessage)
        : msg;
    })
  );
  return touched ? out : messages;
}

// Decode a base64 `data:application/pdf` URL and pull its text with unpdf. The import
// is dynamic so pdf.js (a few hundred KB) only loads when a PDF is actually sent.
async function extractPdfText(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

export async function POST(req: Request) {
  let body: {
    id?: string;
    userId?: string;
    messages?: UIMessage[];
    selectedChatModel?: string;
    customInstructions?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Authenticate before doing any work. A valid `audric_session` Bearer yields the
  // authoritative user id; the body `userId` is only a dev-fallback hint, never
  // trusted when a token is present. Production: missing/invalid token → 401. Dev:
  // the client-asserted id (or none = guest) stands in. Replaces `productionGate`.
  const asserted =
    typeof body.userId === "string" ? body.userId.toLowerCase() : null;
  const auth = await authenticate(req, asserted);
  if (!auth.ok) return auth.response;

  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      {
        error:
          "AI_GATEWAY_API_KEY is not set — add it to apps/mobile/.env.local (server-only, no EXPO_PUBLIC_ prefix) and restart the dev server.",
      },
      { status: 500 }
    );
  }

  const { messages, selectedChatModel } = body;
  // Standing user directions from the Custom instructions sheet. Capped here as
  // well as client-side — the client is not the authority on request size.
  const customInstructions =
    typeof body.customInstructions === "string"
      ? body.customInstructions.trim().slice(0, MAX_CUSTOM_INSTRUCTIONS)
      : "";
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "No messages." }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return Response.json({ error: "Too many messages." }, { status: 413 });
  }
  // Size the request in two buckets: image `file` parts (base64 data URLs, sized by
  // their url length) against the attachment budget, everything else against the
  // tight text budget. A single guard over the whole JSON would reject any image.
  let textChars = 0;
  let attachmentChars = 0;
  for (const msg of messages) {
    for (const part of msg.parts ?? []) {
      const url = (part as { url?: string }).url;
      if (part.type === "file" && typeof url === "string") {
        attachmentChars += url.length;
      } else {
        textChars += JSON.stringify(part).length;
      }
    }
  }
  if (textChars > MAX_REQUEST_CHARS) {
    return Response.json({ error: "Request too large." }, { status: 413 });
  }
  if (attachmentChars > MAX_ATTACHMENT_CHARS) {
    return Response.json({ error: "Attachments too large." }, { status: 413 });
  }

  // --- Persistence (web-v3 parity) ------------------------------------------
  // Save the thread + the incoming user turn BEFORE streaming; the assistant reply
  // saves in onFinish (below). Gated on a well-formed uuid chat id + Sui-address user
  // id — guests send neither, so they get no persistence, exactly like web-v3's
  // anonymous mode. Every DB call is best-effort: a failure is logged but NEVER
  // blocks the stream — the model response must not depend on the DB being reachable.
  const chatId = typeof body.id === "string" ? body.id : "";
  // Authoritative identity: the verified token's `sub` when present, else the
  // dev-fallback asserted id (both already lowercased). Persistence still requires
  // it to be a well-formed Sui address, so a guest (null) is never persisted.
  const userId = auth.userId ?? "";
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
          {
            id: last.id,
            chatId,
            role: "user",
            parts: partsForPersist(last.parts),
            attachments: [],
          },
        ]);
      }
    } catch (error) {
      console.error("[chat route] persist(user turn) failed:", error);
    }
  }

  // Same composer web-v3's chat route uses. `web_search` and `balance_check` are
  // live, so we take the tools branch (regularPrompt + aboutAudricPrompt +
  // searchPrompt + request hints). Geo hints are empty on native (no
  // @vercel/functions). Memory and the artifact tools graft on here as they land,
  // matching web-v3.
  //
  // `boundTools` MUST list exactly the keys of the `tools` object below. web-v3
  // narrows its prompt with `experimental_activeTools`; this route has no such
  // narrowing, so without it the prompt advertises ~14 tools while 2 are bound and
  // the model plans around tools it cannot call (observed on device: it looked for
  // `send_transfer`, failed, and referred the user to a third-party wallet).
  //
  // `isAuthed` tracks the VERIFIED token, not merely a present address: the dev
  // fallback yields a client-asserted id we must not describe to the model as a
  // signed-in user.
  const boundTools = ["web_search", "balance_check"] as const;
  const base = systemPrompt({
    requestHints: {},
    supportsTools: true,
    isAuthed: auth.viaToken,
    boundTools,
  });
  // Custom instructions are USER CONTENT, not policy: fenced and explicitly framed
  // as preferences so they shape tone/format without being read as authority to
  // override the system rules above them.
  const system = customInstructions
    ? `${base}\n\n<user_custom_instructions>\nThe user has set these standing preferences for how you reply. Follow them unless they conflict with your instructions above.\n\n${customInstructions}\n</user_custom_instructions>`
    : base;

  // Extract PDF attachments to text BEFORE the model sees them (raw PDF parts 500 the
  // Gateway). Images pass through for the vision models. This transforms only the
  // model-bound copy; the persisted user turn already saved with its `[file: name]`
  // marker above.
  const preparedMessages = await prepareAttachments(messages);

  const result = streamText({
    model: getLanguageModel(selectedChatModel),
    system,
    messages: await convertToModelMessages(preparedMessages),
    // `balance_check` is bound to the VERIFIED session address (never a model input),
    // so a wallet question gets a real read instead of the fabricated figure the
    // client used to inject — see AUDIT-2026-07-20.md #1. Still to land from web-v3:
    // the DB/blob tools (createDocument, generate_image) and the money WRITE
    // (send_transfer), which needs Enoki + client-side signing.
    // `satisfies` keeps this in lockstep with `boundTools` above in BOTH directions:
    // a bound tool with no implementation, or an implementation the prompt never
    // declared, is a type error rather than a silent prompt/tool mismatch.
    tools: {
      web_search: webSearch,
      balance_check: balanceCheck(userId || null),
    } satisfies Record<(typeof boundTools)[number], unknown>,
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

// Delete a thread from the drawer — `DELETE /api/chat?chatId=&userId=`. Identity is
// the verified `audric_session` (Bearer); the query-layer owner-check then removes
// the thread only if it belongs to that user, so a spoofed id can't delete someone
// else's chat. No-ops cleanly when the DB is absent.
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const asserted = (params.get("userId") ?? "").toLowerCase() || null;
  const auth = await authenticate(request, asserted);
  if (!auth.ok) return auth.response;

  const chatId = params.get("chatId") ?? "";
  const userId = auth.userId ?? "";
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
