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
import { DeleteAllChatsButton } from "@/components/settings/delete-all-chats-button";
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
    <div className="flex flex-col gap-10">
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

      {/* [S.250 P2 #6] Data section — bulk delete of chat history. Lives
       * here (Passport / "my data") rather than its own section because
       * it's a single one-off control; a dedicated /settings/chats route
       * would add navigation surface for one button. */}
      {address && (
        <section className="border-border/40 border-t pt-7">
          <header className="mb-4">
            <h2 className="text-[15px] font-semibold text-foreground">Data</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Manage the data Audric stores for your Passport. Deleting your
              chat history is permanent and cannot be undone.
            </p>
          </header>
          <DeleteAllChatsButton />
        </section>
      )}
    </div>
  );
}
