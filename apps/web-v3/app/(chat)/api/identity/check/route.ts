import { normalizeSuiAddress } from "@mysten/sui/utils";
import { fullHandle, resolveSuinsViaRpc } from "@t2000/sdk";
import { auth } from "@/app/(auth)/auth";
import { getUserByUsername } from "@/lib/db/queries";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";

// Availability check for an @audric handle (debounced by the claim/change UI).
// Layers: format → reserved → DB mirror → live on-chain. RPC failure is a soft
// "can't verify" (claim re-checks live as ground truth).
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("label") ?? "";
  const v = validateAudricLabel(raw);
  if (!v.valid) {
    return Response.json({ available: false, reason: v.reason });
  }
  if (isReserved(v.label)) {
    return Response.json({ available: false, reason: "reserved" });
  }
  const me = normalizeSuiAddress(session.user.id);
  // Taken only if a DIFFERENT v3 user holds it (your own handle isn't "taken").
  const dbHolder = await getUserByUsername(v.label);
  if (dbHolder && dbHolder.id !== session.user.id) {
    return Response.json({ available: false, reason: "taken" });
  }
  try {
    const onChain = await resolveSuinsViaRpc(fullHandle(v.label));
    // Leaf points at someone else → taken. Unregistered (null) or already
    // targeting YOU (a v2 handle to adopt) → available.
    if (onChain && normalizeSuiAddress(onChain) !== me) {
      return Response.json({ available: false, reason: "taken" });
    }
  } catch {
    return Response.json({ available: true, verifierDown: true });
  }
  return Response.json({ available: true });
}
