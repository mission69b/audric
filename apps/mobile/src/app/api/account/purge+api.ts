import {
  deleteAllChatsByUserId,
  deleteAllDocumentsByUserId,
} from "@/lib/db/queries";
import { authenticate } from "@/lib/api-guard";

// "Purge all my data" — `POST /api/account/purge`. Wipes the verified user's content:
// chats (+ their votes/messages/streams) and artifact Documents (+ suggestions). KEEPS
// the account identity, credit ledger, and subscription. Native analogue of web-v3's
// `account/purge` route, minus the blob purge (mobile has no blob layer; web-v3 treats
// that step as best-effort and orphaned blobs are non-fatal). Memory is separate — the
// "Forget all memories" action bumps the epoch; purge does not touch it, matching web-v3.
//
// Identity is the verified `audric_session` (Bearer); the body `userId` is only a
// dev-fallback hint, never trusted when a token is present. No-ops when the DB is absent.

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export async function POST(request: Request) {
  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const asserted =
    typeof body.userId === "string" ? body.userId.toLowerCase() : null;
  const auth = await authenticate(request, asserted);
  if (!auth.ok) return auth.response;

  const userId = auth.userId ?? "";
  if (!SUI_ADDRESS.test(userId)) {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  if (!process.env.POSTGRES_URL) {
    return Response.json({
      ok: true,
      persisted: false,
      chatsDeleted: 0,
      documentsDeleted: 0,
    });
  }
  try {
    const chats = await deleteAllChatsByUserId({ userId });
    const docs = await deleteAllDocumentsByUserId({ userId });
    return Response.json({
      ok: true,
      chatsDeleted: chats.deletedCount,
      documentsDeleted: docs.deletedCount,
    });
  } catch (error) {
    console.error("[purge route] failed:", error);
    return Response.json(
      { ok: false, error: "Purge failed." },
      { status: 500 }
    );
  }
}
