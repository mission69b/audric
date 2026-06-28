import { auth } from "@/app/(auth)/auth";
import { canUseApi, generateApiKey } from "@/lib/api/keys";
import {
  createApiKey,
  getCreditBalanceMicros,
  getUserById,
  listApiKeys,
  revokeApiKey,
} from "@/lib/db/queries";

// Session-authed management surface for Private API keys (SPEC_AUDRIC_API v1).
// This is the UI/dashboard side (zkLogin session), distinct from the API's own
// `sk-…` bearer auth. The plaintext secret is returned exactly ONCE on create.

const MAX_KEYS = 10;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const [user, balance, keys] = await Promise.all([
    getUserById(session.user.id),
    getCreditBalanceMicros(session.user.id),
    listApiKeys(session.user.id),
  ]);

  return Response.json({
    canIssue: canUseApi(user?.subscriptionTier, balance),
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
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const [user, balance] = await Promise.all([
    getUserById(session.user.id),
    getCreditBalanceMicros(session.user.id),
  ]);
  if (!canUseApi(user?.subscriptionTier, balance)) {
    return Response.json(
      { error: "Add credit or a plan to mint a key." },
      { status: 402 }
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
  const session = await auth();
  if (!session?.user) {
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
