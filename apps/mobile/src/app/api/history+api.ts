import { getChatsByUserId } from "@/lib/db/queries";
import { authenticate } from "@/lib/api-guard";

// History route — the drawer's chat list. Returns this user's threads (id + title +
// createdAt), newest first; the client groups them by recency. Native analogue of
// web-v3's `getChatsByUserId`.
//
// Identity is the verified `audric_session` (Bearer); the query-string `userId` is
// only a dev-fallback hint (the __DEV__ stub). A caller only ever sees their OWN
// threads because the lookup keys on the authenticated id, never the URL.

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export async function GET(request: Request) {
  const asserted =
    (new URL(request.url).searchParams.get("userId") ?? "").toLowerCase() ||
    null;
  const auth = await authenticate(request, asserted);
  if (!auth.ok) return auth.response;

  const userId = auth.userId ?? "";
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
