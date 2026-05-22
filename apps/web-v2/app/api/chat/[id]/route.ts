/**
 * `GET /api/chat/[id]` — authenticated chat hydration endpoint.
 *
 * **Why this exists (P0-B fix, v0.7e Persistent Chats follow-up).**
 *
 * v0.7e shipped `/chat/[id]/page.tsx` as a server component that gated
 * private-chat ownership via `getCurrentUser()`. That helper reads
 * `x-zklogin-jwt` from request headers, but RSC document navigations
 * (sidebar `<Link>` click, refresh) never send custom headers — the
 * zkLogin JWT lives in `localStorage` and only rides on `authFetch`
 * `fetch()` calls. Net effect: every private-chat resume returned 404
 * for the actual owner.
 *
 * The fix routes chat hydration through an API endpoint that:
 *   1. Reads the JWT from the `x-zklogin-jwt` header (set by `authFetch`).
 *   2. Verifies the chat exists.
 *   3. For private chats: owner-only (404 not 403 to avoid existence
 *      enumeration).
 *   4. For public chats: returns chat + messages; the page-side client
 *      decides whether to render the live composer (owner) or redirect
 *      to `/share/[id]` (non-owner — P1-D fix).
 *
 * The client component at `app/chat/[id]/page.tsx` calls this via
 * `authFetch` so the JWT header lands.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  getChatById,
  getMessagesByChatId,
} from "@/lib/audric/chat-persistence";
import { getCurrentUser } from "@/lib/audric-auth";
import { convertToUIMessages } from "@/lib/utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const chat = await getChatById({ chatId: id });
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // Private chats require ownership. Public chats are readable by any
  // authenticated caller; the page-side client decides whether to render
  // the live composer (owner) or redirect to `/share/[id]` (non-owner).
  if (chat.visibility === "private") {
    const session = await getCurrentUser();
    if (!session?.user) {
      // 401 (not 404) so authFetch fires the zklogin:expired event and
      // the user is prompted to sign in / refresh their session.
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    if (session.user.id !== chat.userId) {
      // 404 — never 403 — for private-chat non-owners to avoid leaking
      // chat existence (same rule as the pre-P0-B server-component
      // gate, just enforced through the API now).
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
  }

  const dbMessages = await getMessagesByChatId({ chatId: id });
  const messages = convertToUIMessages(dbMessages);

  // [Smoke 2026-05-22 V3 diagnostic] Fingerprint per-part state on
  // chat-load. Pairs with `body-messages-states` (POST entry) +
  // `persist-states` (onFinish) in /api/chat/route.ts to triangulate
  // whether the "ghost permission card after refresh" bug is a persist
  // bug (DB has approval-requested) vs a load bug (DB has output-
  // available but load path corrupts it). Cheap; one log line per
  // chat-load (only sidebar-click + page-reload).
  try {
    const trunc = (s: string) => s.slice(0, 8);
    const summary = messages
      .map((msg, idx) => {
        const parts = Array.isArray(msg.parts) ? msg.parts : [];
        const partSummaries = parts.map((rawPart) => {
          const part = rawPart as
            | {
                type?: string;
                toolCallId?: string;
                state?: string;
                output?: unknown;
                approval?: { id?: string; approved?: boolean };
              }
            | undefined;
          if (!part || typeof part.type !== "string") {
            return "?";
          }
          if (
            part.type.startsWith("tool-") &&
            part.type !== "tool-approval-request" &&
            part.type !== "tool-approval-response"
          ) {
            const tool = part.type.slice("tool-".length);
            const callId =
              typeof part.toolCallId === "string"
                ? trunc(part.toolCallId)
                : "?";
            const state = part.state ?? "?";
            const hasOut = part.output !== undefined ? "Y" : "N";
            const approval =
              part.approval !== undefined
                ? `,approval=${part.approval.approved === true ? "Y" : part.approval.approved === false ? "N" : "P"}`
                : "";
            return `${part.type}(${tool},id=${callId},state=${state},output=${hasOut}${approval})`;
          }
          return part.type;
        });
        const msgId = msg.id ? trunc(msg.id) : "noid";
        return `[${idx}] ${msg.role}(${msgId}): ${partSummaries.join("|") || "(empty)"}`;
      })
      .join(" || ");
    console.log(
      `[audric-chat] load-states chatId=${id} msgs=${messages.length} ${summary}`
    );
  } catch (logErr) {
    console.warn(
      "[audric-chat] load-states logging threw (non-fatal):",
      logErr instanceof Error ? logErr.message : String(logErr)
    );
  }

  return NextResponse.json({
    chat: {
      id: chat.id,
      title: chat.title,
      visibility: chat.visibility,
      userId: chat.userId,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
    },
    messages,
  });
}
