import { displayHandle } from "@t2000/sdk";
import { auth } from "@/app/(auth)/auth";
import { getUserById } from "@/lib/db/queries";
import { isIdentityConfigured } from "@/lib/identity/custody";

// The signed-in user's @audric handle (or null) + whether handle minting is
// available in this environment. Drives the Passport section + sidebar display.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const me = await getUserById(session.user.id);
  const username = me?.username ?? null;
  return Response.json({
    username,
    handle: username ? displayHandle(username) : null,
    configured: isIdentityConfigured(),
  });
}
