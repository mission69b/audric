import { getCurrentUser } from "@audric/auth/server";
import {
  handleOnrampPost,
  onrampConfig,
  onrampConfigured,
} from "@audric/onramp/server";
import { env } from "@/lib/env";

// POST /api/onramp — thin wrapper over the shared onramp handler
// (@audric/onramp, S.684): this app supplies its validated env + the
// signed-in Passport; the destination rule lives in the package.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const session = await getCurrentUser();
  return handleOnrampPost(
    req,
    onrampConfigured(env) ? onrampConfig(env) : null,
    session?.user.id ?? null,
    session?.user.email ?? null
  );
}
