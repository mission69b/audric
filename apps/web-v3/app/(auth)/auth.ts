import { getCurrentUser } from "@/lib/audric-auth";

// Audric v3 auth = zkLogin Passport (cookie-based), NOT next-auth. This module
// keeps the template's `auth()` / `Session` / `UserType` surface so server
// call sites (`const session = await auth()`) work unchanged — but it
// delegates to the cookie-verified zkLogin session.
//
// `'guest'` is retained in the type only for the entitlements map; v3 has no
// server-side guest session — anonymous users have no cookie (`auth()` → null)
// and chat on the free model client-side. A signed-in user is `'regular'`.

export type UserType = "guest" | "regular";

export interface SessionUser {
  email: string | null;
  id: string;
  type: UserType;
}

export interface Session {
  user: SessionUser;
}

/** Drop-in for next-auth's `auth()` — returns the cookie-verified zkLogin
 * session, or `null` for anonymous. */
export async function auth(): Promise<Session | null> {
  const current = await getCurrentUser();
  if (!current) {
    return null;
  }
  return {
    user: {
      id: current.user.id,
      email: current.user.email,
      type: "regular",
    },
  };
}
