/**
 * `/share/[id]` — public chat viewer (v0.7e Persistent Chats Phase 4).
 *
 * Server component that hydrates a chat row + its messages and hands
 * them to `<SharedChatViewer>`. **No auth required** — that's the
 * entire point of a public share.
 *
 * **Gating rules:**
 *   - Chat must exist AND `chat.visibility === 'public'`. Otherwise
 *     404. We never 403 because the chat's existence is itself
 *     sensitive (do not leak the fact that a private chat lives at
 *     this id).
 *   - No `getCurrentUser()` call — the page is intentionally
 *     reachable from an incognito window with no Audric session.
 *
 * The component re-uses `<SharedChatViewer>` instead of the live
 * `<AudricChatClient>` so we do NOT mount `useChat`, the transport,
 * or any engine-bound state for read-only viewers.
 *
 * **Next 16 cacheComponents compatibility:** all per-request DB reads
 * live inside the `<ShareHydrator>` child, which is wrapped in
 * `<Suspense>`. This satisfies the `cacheComponents` invariant that
 * uncached data only be accessed inside a Suspense boundary.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SharedChatViewer } from "@/components/chat/shared-chat-viewer";
import {
  getChatById,
  getMessagesByChatId,
} from "@/lib/audric/chat-persistence";
import { convertToUIMessages } from "@/lib/utils";

export default function ShareByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ShareHydrator params={params} />
    </Suspense>
  );
}

async function ShareHydrator({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const chat = await getChatById({ chatId: id });
  if (!chat || chat.visibility !== "public") {
    notFound();
  }

  const dbMessages = await getMessagesByChatId({ chatId: id });
  const messages = convertToUIMessages(dbMessages);

  return <SharedChatViewer chatTitle={chat.title} messages={messages} />;
}
