import { auth } from "@/app/(auth)/auth";
import { deleteBlob } from "@/lib/blob";
import {
  deleteAllChatsByUserId,
  deleteAllDocumentsByUserId,
  getAttachmentPathnamesByUserId,
} from "@/lib/db/queries";

// Purge-all-my-data (Phase 6, SPEC §6 first-class deletion). Wipes the user's
// content — chats (+ messages/votes/streams), artifact Documents (+ suggestions),
// and their uploaded attachment blobs. KEEPS the account identity, credit ledger
// (financial/audit record), and subscription. Memory is handled separately: it's
// encrypted + opt-in, and hard-delete via the relayer isn't in the SDK yet —
// turning memory OFF stops recall; the honest label says the blob expires.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  // Collect blob refs BEFORE deleting the rows that reference them.
  const pathnames = await getAttachmentPathnamesByUserId(userId);

  const chats = await deleteAllChatsByUserId({ userId });
  const docs = await deleteAllDocumentsByUserId({ userId });

  // Best-effort blob purge — never block the data wipe on a storage hiccup.
  let blobsDeleted = 0;
  await Promise.all(
    pathnames.map(async (p) => {
      try {
        await deleteBlob(p);
        blobsDeleted += 1;
      } catch {
        // orphaned blob — non-fatal; the DB reference is already gone
      }
    })
  );

  return Response.json({
    ok: true,
    chatsDeleted: chats.deletedCount,
    documentsDeleted: docs.deletedCount,
    blobsDeleted,
  });
}
