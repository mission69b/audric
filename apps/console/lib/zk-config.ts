import type { EnokiNetwork, ZkLoginConfig } from "@audric/auth/client";
import { env } from "@/lib/env";

// Built from THIS app's inlined NEXT_PUBLIC_* — the @audric/auth package can't
// read these from process.env (static replacement doesn't fire inside a
// transpilePackages dep; see packages/auth/src/client.ts).
export const ZK_CONFIG: ZkLoginConfig = {
  enokiApiKey: env.NEXT_PUBLIC_ENOKI_API_KEY,
  googleClientId: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  network: env.NEXT_PUBLIC_SUI_NETWORK as EnokiNetwork,
};
