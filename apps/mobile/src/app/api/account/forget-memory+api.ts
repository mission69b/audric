import { incrementMemoryEpoch } from "@/lib/db/queries";
import { authenticate } from "@/lib/api-guard";

// "Forget all my memories" — `POST /api/account/forget-memory`. Bumps the verified
// user's memory epoch so recall/save move to a fresh namespace (`address#vN`) and
// every prior memory is never recalled again; the old encrypted Walrus blobs expire
// on their own. Native analogue of web-v3's `account/forget-memory` route. HONEST:
// this stops recall + lets storage expire — it is NOT a provable on-chain erasure.
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
    return Response.json({ ok: true, persisted: false, epoch: 0 });
  }
  try {
    const epoch = await incrementMemoryEpoch(userId);
    return Response.json({ ok: true, epoch });
  } catch (error) {
    console.error("[forget-memory route] failed:", error);
    return Response.json(
      { ok: false, error: "Forget failed." },
      { status: 500 }
    );
  }
}
