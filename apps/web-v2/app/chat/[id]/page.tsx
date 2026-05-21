/**
 * `/chat/[id]` — click-to-resume page (v0.7e Persistent Chats Phase 3).
 *
 * Server component that hydrates a saved chat row + its message history
 * server-side, then hands them to `<AudricChatClient>` so `useChat({ id,
 * messages })` mounts with full context. The sidebar's `<ChatItem>`
 * navigates here on click (`href={'/chat/' + chat.id}`); refreshing this
 * URL also drops the user back into the same conversation.
 *
 * **Auth model:**
 *   - PRIVATE chat → only the owner can open it; non-owners see 404.
 *   - PUBLIC chat → anyone signed in can open it (no-auth viewers go
 *     through `/share/[id]` instead, which is the Phase 4 read-only
 *     surface). Returning 404 for unauthorised opens (rather than 403)
 *     prevents chat-existence enumeration.
 *
 * **Why the auth gate runs server-side:** keeps the unauthorised path
 * cheap (no client JS, no `useChat` mount, no Engine request), and the
 * 404 response is cacheable per Next 16.
 *
 * **Next 16 cacheComponents compatibility:** all per-request DB reads
 * (chat row, message history, current user) live inside the
 * `<ChatHydrator>` child, which is wrapped in `<Suspense>`. This
 * satisfies the `cacheComponents` invariant that uncached data only
 * be accessed inside a Suspense boundary, and lets Next stream the
 * layout chrome while the chat data resolves.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getChatById,
  getMessagesByChatId,
} from "@/lib/audric/chat-persistence";
import { getCurrentUser } from "@/lib/audric-auth";
import { convertToUIMessages } from "@/lib/utils";
import { AudricChatClient } from "../audric-chat-client";

export default function ChatByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ChatHydrator params={params} />
    </Suspense>
  );
}

async function ChatHydrator({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const chat = await getChatById({ chatId: id });
  if (!chat) {
    notFound();
  }

  if (chat.visibility === "private") {
    // Owner-only gate. Non-owners (and unauthenticated callers) get a
    // 404 — never a 403 — so chat existence is not leaked.
    const session = await getCurrentUser();
    if (!session?.user || session.user.id !== chat.userId) {
      notFound();
    }
  }

  const dbMessages = await getMessagesByChatId({ chatId: id });
  const initialMessages = convertToUIMessages(dbMessages);

  return (
    <AudricChatClient
      chatId={id}
      initialMessages={initialMessages}
      initialVisibility={chat.visibility as "private" | "public"}
    />
  );
}
