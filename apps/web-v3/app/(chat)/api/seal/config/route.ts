import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { env } from "@/lib/env";
import { isSealConfigured } from "@/lib/seal";

// Public Seal config for the client (packageId is not secret; the API key is).
// The client needs the packageId to construct its SessionKey.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ configured: false }, { status: 401 });
  }
  return NextResponse.json({
    configured: isSealConfigured(),
    packageId: env.SEAL_POLICY_PACKAGE_ID ?? null,
  });
}
