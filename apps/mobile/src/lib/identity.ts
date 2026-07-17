import type { StoredSession } from "@/auth/session";

// Shared identity-display helpers, so every surface renders the SAME signed-in
// wallet address/handle from the real session (useAuth().session) instead of the
// static catalog constants. Showing a stale/placeholder deposit address is a
// fund-loss risk, so these all derive from the live session.

/**
 * Truncate a Sui address for compact rows (menus, footers): `0x1234…cdef`.
 * `head`/`tail` count hex chars kept on each side (defaults mirror the drawer/
 * account-menu prototype: 6 leading incl. `0x`, 4 trailing). Returns "" for an
 * absent address so callers can render a placeholder.
 */
export function shortAddress(address?: string | null, head = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * A display handle for the signed-in user. Prefer the local-part of the verified
 * email; fall back to a short address; finally "you". Never invents a name.
 */
export function displayHandle(session?: StoredSession | null): string {
  const email = session?.email;
  if (email && email.includes("@")) return email.slice(0, email.indexOf("@"));
  const addr = shortAddress(session?.address);
  return addr || "you";
}

/** Format a session's absolute expiry as a short local date, or "" if unknown. */
export function expiresLabel(session?: StoredSession | null): string {
  const ms = session?.expiresAt;
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
