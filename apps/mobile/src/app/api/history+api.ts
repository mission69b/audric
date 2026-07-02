import { getChatsByUserId } from "@/lib/db/queries";
import { productionGate } from "@/lib/api-guard";

// History route — the drawer's chat list. Returns this user's threads (id + title +
// createdAt), newest first; the client groups them by recency. Native analogue of
// web-v3's `getChatsByUserId`.
//
// ⚠️ DEV TRUST MODEL (same as `user+api.ts` / `chat+api.ts`): the `userId` comes from
// the query string, unauthenticated. Fine for dev (the id is the __DEV__ stub). Before
// exposure this MUST read the identity from the verified session cookie, not the URL.

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export async function GET(request: Request) {
  const gated = productionGate();
  if (gated) return gated;

  const userId = (
    new URL(request.url).searchParams.get("userId") ?? ""
  ).toLowerCase();
  if (!SUI_ADDRESS.test(userId)) {
    return Response.json({ chats: [] });
  }
  if (!process.env.POSTGRES_URL) {
    return Response.json({ chats: [] });
  }
  try {
    const rows = await getChatsByUserId(userId);
    return Response.json({
      chats: rows.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt:
          c.createdAt instanceof Date
            ? c.createdAt.toISOString()
            : String(c.createdAt),
      })),
    });
  } catch (error) {
    console.error("[history route] load failed:", error);
    return Response.json({ chats: [] });
  }
}
