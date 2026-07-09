import {
  handleOnrampPost,
  onrampConfig,
  onrampConfigured,
} from "@audric/onramp/server";
import { auth } from "@/app/(auth)/auth";
import { env } from "@/lib/env";

// POST /api/onramp — thin wrapper over the shared onramp handler
// (@audric/onramp, S.684): Audric supplies its validated env + the signed-in
// Passport; the destination rule (funds land at the Passport, never a
// client-supplied address) lives in the package. (No `dynamic` segment
// config — web-v3 runs cacheComponents, and POST is never cached.)

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  return handleOnrampPost(
    req,
    onrampConfigured(env) ? onrampConfig(env) : null,
    session?.user?.id ?? null
  );
}
