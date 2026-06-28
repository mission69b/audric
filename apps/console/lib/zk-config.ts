import type { EnokiNetwork, ZkLoginConfig } from "@audric/auth/client";

// The client zkLogin config (the @audric/auth package can't read these from
// process.env — static replacement doesn't fire inside a transpilePackages dep;
// see packages/auth/src/client.ts).
//
// Read NEXT_PUBLIC_* DIRECTLY here (this is app code → Next statically inlines
// them) rather than importing the `@/lib/env` gate. Importing the gate would
// pull its top-level Zod validation into the build graph of the statically
// prerendered /auth/callback page, where `isServer` is true → it would demand
// the SERVER secrets (AUTH_SECRET/POSTGRES_URL) at build and fail the deploy.
// The runtime boot gate (instrumentation.ts → lib/env.ts) still validates all
// vars when the server actually starts.
export const ZK_CONFIG: ZkLoginConfig = {
  enokiApiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  network: (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as EnokiNetwork,
};
