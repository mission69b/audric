import { isProofExpired } from "./keys";

describe("isProofExpired", () => {
  it("is false before expiry", () => {
    expect(isProofExpired({ expiresAt: 10_000 }, 5_000)).toBe(false);
  });
  it("is true at/after expiry", () => {
    expect(isProofExpired({ expiresAt: 10_000 }, 10_000)).toBe(true);
    expect(isProofExpired({ expiresAt: 10_000 }, 20_000)).toBe(true);
  });
});
