import { jwtVerify } from "jose";

// SERVER-ONLY. Imported only by the `+api` routes (through `lib/api-guard`), so
// `AUTH_SECRET` never enters the client bundle. Do NOT import this from any UI /
// component / hook module.
//
// Verifies the `audric_session` token minted by web-v3's mobile-auth exchange
// (`packages/auth` `mintSessionToken`: HS256 over AUTH_SECRET, `sub` = the Sui
// address, payload `{ email }`, ~7-day exp). This is a deliberate, minimal MIRROR
// of `packages/auth`'s `verifySessionToken`: the mobile backend can't import that
// module (it drags `server-only` + Enoki + `next/headers`, none of which resolve
// under Expo), but this MUST stay byte-compatible with it — same algorithm, same
// secret, same claim shape — so a token minted there verifies here unchanged.

const sessionSecret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

export interface MobileUser {
  /** Canonical zkLogin Sui address (the Passport wallet) = the user id. */
  id: string;
  email: string | null;
}

/**
 * Verify an `audric_session` token; returns the user or `null` (missing secret,
 * bad signature, wrong alg, or expired — `jwtVerify` enforces `exp`).
 */
export async function verifyMobileSession(
  token: string
): Promise<MobileUser | null> {
  if (!process.env.AUTH_SECRET) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
    });
    const id =
      typeof payload.sub === "string" ? payload.sub.toLowerCase() : null;
    if (!id) {
      return null;
    }
    return {
      id,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  } catch {
    return null;
  }
}
