import {
  createApiKey,
  generateApiKey,
  getUserById,
  isPaidTier,
  listApiKeys,
  revokeApiKey,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";

// Session-authed (zkLogin) management surface for Private API keys, on the
// t2000 console. Mints the SAME `sk-…` keys as audric.ai (shared @audric/accounts
// hash) → they authenticate against api.t2000.ai. The plaintext secret is
// returned exactly ONCE on create. (SPEC_T2000_API_V2 M1.)

const MAX_KEYS = 10;

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await getUserById(session.user.id);
  const keys = await listApiKeys(session.user.id);

  return Response.json({
    paid: isPaidTier(user?.subscriptionTier),
    keys: keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      })),
  });
}

export async function POST() {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await getUserById(session.user.id);
  if (!isPaidTier(user?.subscriptionTier)) {
    return Response.json(
      { error: "The Private API is available on the Pro and Max plans." },
      { status: 403 }
    );
  }

  // Cap live keys so a runaway client can't mint unbounded rows.
  const existing = await listApiKeys(session.user.id);
  if (existing.filter((k) => !k.revokedAt).length >= MAX_KEYS) {
    return Response.json(
      { error: `You can have at most ${MAX_KEYS} active keys.` },
      { status: 400 }
    );
  }

  const { secret, hashedKey, keyPrefix } = generateApiKey();
  const row = await createApiKey({
    userId: session.user.id,
    hashedKey,
    keyPrefix,
  });

  // `key` is the plaintext secret — returned ONCE, never retrievable again.
  return Response.json({
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt,
    key: secret,
  });
}

export async function DELETE(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const revoked = await revokeApiKey(id, session.user.id);
  return Response.json({ revoked });
}
