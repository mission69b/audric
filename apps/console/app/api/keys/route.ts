import {
  createApiKey,
  generateApiKey,
  listApiKeys,
  revokeApiKey,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";

// Session-authed (zkLogin) management surface for Private Inference keys, on the
// t2000 console. Mints the SAME `sk-…` keys as audric.ai (shared @audric/accounts
// hash) → they authenticate against api.t2000.ai. The plaintext secret is
// returned exactly ONCE on create. (SPEC_T2000_API_V2 M1.)

const MAX_KEYS = 10;

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const keys = await listApiKeys(session.user.id);

  return Response.json({
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

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Minting is free (S.711): the free daily allowance on kimi-k2.7-code means
  // a $0 account can use the API — paid models still 402 at request time.
  // Cap live keys so a runaway client can't mint unbounded rows.
  const existing = await listApiKeys(session.user.id);
  if (existing.filter((k) => !k.revokedAt).length >= MAX_KEYS) {
    return Response.json(
      { error: `You can have at most ${MAX_KEYS} active keys.` },
      { status: 400 }
    );
  }

  let name: string | undefined;
  try {
    const body = (await request.json()) as { name?: string };
    name = body?.name?.trim().slice(0, 64) || undefined;
  } catch {
    // body optional
  }

  const { secret, hashedKey, keyPrefix } = generateApiKey();
  const row = await createApiKey({
    userId: session.user.id,
    hashedKey,
    keyPrefix,
    name,
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
