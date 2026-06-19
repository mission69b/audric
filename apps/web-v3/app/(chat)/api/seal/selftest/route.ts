import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { env } from "@/lib/env";
import {
  isSealConfigured,
  sealDecryptForOwner,
  sealEncryptForOwner,
} from "@/lib/seal";

// Seal round-trip validation (spike). GET encrypts a known probe to the
// signed-in user's address; POST decrypts it back using a SessionKey the client
// signed with its zkLogin key. Proves the full zkLogin↔Seal path on mainnet.
// Throwaway-ish: graduates into the real putBlob/getBlob path (Stage 3).

const PROBE = "audric-seal-ok";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSealConfigured()) {
    return NextResponse.json(
      { error: "Seal not configured (SEAL_API_KEY / SEAL_POLICY_PACKAGE_ID)" },
      { status: 503 }
    );
  }
  const data = new TextEncoder().encode(`${PROBE}:${Date.now()}`);
  const encrypted = await sealEncryptForOwner(session.user.id, data);
  return NextResponse.json({
    encryptedB64: toBase64(encrypted),
    packageId: env.SEAL_POLICY_PACKAGE_ID,
    expectedPrefix: PROBE,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSealConfigured()) {
    return NextResponse.json({ error: "Seal not configured" }, { status: 503 });
  }
  try {
    const { encryptedB64, exportedSessionKey } = (await request.json()) as {
      encryptedB64: string;
      exportedSessionKey: Parameters<typeof sealDecryptForOwner>[1];
    };
    const plaintext = await sealDecryptForOwner(
      session.user.id,
      exportedSessionKey,
      fromBase64(encryptedB64)
    );
    return NextResponse.json({ plaintext: new TextDecoder().decode(plaintext) });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
