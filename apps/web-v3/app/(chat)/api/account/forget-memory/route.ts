import { auth } from "@/app/(auth)/auth";
import { incrementMemoryEpoch } from "@/lib/db/queries";

// "Forget all my memories" (Phase 6, honest interim). Bumps the user's memory
// epoch → recall/save move to a fresh namespace (`address#vN`), so every prior
// memory is never recalled again. The old encrypted Walrus blobs are left to
// expire on their own. HONEST: this stops recall + lets storage expire — it is
// NOT a provable on-chain erasure (that awaits a MemWal relayer forget op).
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const epoch = await incrementMemoryEpoch(session.user.id);
  return Response.json({ ok: true, epoch });
}
