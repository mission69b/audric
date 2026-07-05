import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { authenticate } from "@/lib/api-guard";

// Messages route — opening a past thread. Returns one chat's messages in send order,
// already in the UIMessage shape `useChat` hydrates from (id / role / parts). Native
// analogue of web-v3's chat-page loader (`getMessagesByChatId` → `convertToUIMessages`).
//
// Identity is the verified `audric_session` (Bearer); the query-string `userId` is
// only a dev-fallback hint. It is further enforced as an ownership check below — a
// thread's messages are only returned to its authenticated owner.

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const asserted = (params.get("userId") ?? "").toLowerCase() || null;
  const auth = await authenticate(request, asserted);
  if (!auth.ok) return auth.response;

  const chatId = params.get("chatId") ?? "";
  const userId = auth.userId ?? "";

  if (!UUID_RE.test(chatId) || !SUI_ADDRESS.test(userId)) {
    return Response.json({ messages: [] });
  }
  if (!process.env.POSTGRES_URL) {
    return Response.json({ messages: [] });
  }

  try {
    // Ownership gate: only the thread's owner may read its messages.
    const owner = await getChatById(chatId);
    if (!owner || owner.userId.toLowerCase() !== userId) {
      return Response.json({ messages: [] });
    }
    const rows = await getMessagesByChatId(chatId);
    return Response.json({
      messages: rows.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
      })),
    });
  } catch (error) {
    console.error("[messages route] load failed:", error);
    return Response.json({ messages: [] });
  }
}
