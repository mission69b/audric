"use client";

/**
 * `/settings/passport` — wallet, identity, network, sign-in, appearance.
 *
 * Hooks together:
 *   - `useZkLogin()` for address/session/logout/refresh
 *   - `useUserStatus(address, jwt)` for the claimed Audric handle
 *   - `decodeJwtClaim(jwt, 'name')` for the picker smart pre-fill
 */

import { useZkLogin } from "@/components/auth/use-zklogin";
import { PassportSection } from "@/components/settings/passport-section";
import { useUserStatus } from "@/hooks/use-user-status";
import { decodeJwtClaim } from "@/lib/jwt-client";

// Network is hardcoded mainnet across audric production today; the legacy
// `SUI_NETWORK` constant on apps/web also reads `'mainnet'` in prod. If a
// testnet preview ever lands we can plumb this via env (`NEXT_PUBLIC_SUI_NETWORK`).
const SUI_NETWORK = "mainnet";

export default function PassportPage() {
  const { address, session, logout, refresh, expiringSoon } = useZkLogin();
  const jwt = session?.jwt ?? null;
  const userStatus = useUserStatus(address, jwt ?? undefined);

  return (
    <PassportSection
      address={address}
      expiresAt={session?.expiresAt ?? null}
      expiringSoon={expiringSoon}
      googleName={decodeJwtClaim(jwt, "name")}
      jwt={jwt}
      network={SUI_NETWORK}
      onLogout={logout}
      onRefresh={refresh}
      onUsernameChanged={() => {
        userStatus.refetch().catch(() => {
          // refetch failure is non-fatal — state will refresh next visit
        });
      }}
      username={userStatus.username}
    />
  );
}
