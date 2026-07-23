import { isSessionExpired, type StoredSession } from "./session";

// Guards the launch-path rule from AUDIT-2026-07-20.md #2: an expired token must
// never restore as a signed-in shell (every data route would 401 behind an
// authenticated-looking UI), while an untokened guest record must survive.

const NOW = 1_800_000_000_000;

function session(over: Partial<StoredSession> = {}): StoredSession {
  return { address: "0xabc", email: null, savedAt: NOW - 1000, ...over };
}

describe("isSessionExpired", () => {
  it("treats a past expiry as expired", () => {
    expect(isSessionExpired(session({ expiresAt: NOW - 1 }), NOW)).toBe(true);
  });

  it("treats the exact expiry instant as expired", () => {
    expect(isSessionExpired(session({ expiresAt: NOW }), NOW)).toBe(true);
  });

  it("keeps a session whose expiry is still ahead", () => {
    expect(isSessionExpired(session({ expiresAt: NOW + 1 }), NOW)).toBe(false);
  });

  it("keeps an untokened guest session that never carried an expiry", () => {
    expect(isSessionExpired(session(), NOW)).toBe(false);
  });

  it("treats no session as not-expired (nothing to clear)", () => {
    expect(isSessionExpired(null, NOW)).toBe(false);
  });
});
