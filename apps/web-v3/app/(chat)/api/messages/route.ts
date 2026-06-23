import { auth } from "@/app/(auth)/auth";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY = {
  messages: [],
  visibility: "private",
  userId: null,
  isReadonly: false,
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }
  // A malformed (non-UUID) id makes the Postgres query throw → previously a 500.
  // It's just "no such chat" — return the empty shape gracefully.
  if (!UUID_RE.test(chatId)) {
    return Response.json(EMPTY);
  }

  let session: Awaited<ReturnType<typeof auth>>;
  let chat: Awaited<ReturnType<typeof getChatById>>;
  let messages: Awaited<ReturnType<typeof getMessagesByChatId>>;
  try {
    [session, chat, messages] = await Promise.all([
      auth(),
      getChatById({ id: chatId }),
      getMessagesByChatId({ id: chatId }),
    ]);
  } catch {
    // DB hiccup / lookup failure → graceful empty instead of a 500.
    return Response.json(EMPTY);
  }

  if (!chat) {
    return Response.json(EMPTY);
  }

  if (
    chat.visibility === "private" &&
    (!session?.user || session.user.id !== chat.userId)
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const isReadonly = !session?.user || session.user.id !== chat.userId;

  return Response.json({
    messages: convertToUIMessages(messages),
    visibility: chat.visibility,
    userId: chat.userId,
    isReadonly,
  });
}
