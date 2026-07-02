import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { productionGate } from "@/lib/api-guard";

// Messages route — opening a past thread. Returns one chat's messages in send order,
// already in the UIMessage shape `useChat` hydrates from (id / role / parts). Native
// analogue of web-v3's chat-page loader (`getMessagesByChatId` → `convertToUIMessages`).
//
// ⚠️ DEV TRUST MODEL (same as the other routes): `userId` comes from the query string,
// unauthenticated. It IS enforced here as an ownership check — a thread's messages are
// only returned to its owner — but the identity itself is still client-asserted. Before
// exposure this MUST come from the verified session cookie, not the URL.

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const gated = productionGate();
  if (gated) return gated;

  const params = new URL(request.url).searchParams;
  const chatId = params.get("chatId") ?? "";
  const userId = (params.get("userId") ?? "").toLowerCase();

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
