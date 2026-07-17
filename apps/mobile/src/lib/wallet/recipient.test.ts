import { isSuiAddress, normalizeSuins, resolveRecipient } from "./recipient";

describe("normalizeSuins", () => {
  it("maps @audric handles to .sui names", () => {
    expect(normalizeSuins("alice@audric")).toBe("alice.audric.sui");
  });
  it("passes through .sui names", () => {
    expect(normalizeSuins("bob.sui")).toBe("bob.sui");
  });
  it("lowercases + trims", () => {
    expect(normalizeSuins("  Bob.Sui  ")).toBe("bob.sui");
  });
});

describe("isSuiAddress", () => {
  it("accepts 0x + 64 hex", () => {
    expect(isSuiAddress(`0x${"a".repeat(64)}`)).toBe(true);
  });
  it("rejects short strings", () => {
    expect(isSuiAddress("0xabc")).toBe(false);
  });
});

describe("resolveRecipient", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("passes a 0x address straight through without a network call", async () => {
    const addr = `0x${"a".repeat(64)}`;
    global.fetch = jest.fn(() => {
      throw new Error("should not be called for a 0x address");
    }) as unknown as typeof fetch;
    await expect(resolveRecipient(addr)).resolves.toEqual({
      address: addr,
      resolved: null,
    });
  });

  it("resolves a .sui name via data.address.address", async () => {
    const resolvedAddr = `0x${"c".repeat(64)}`;
    const fetchMock = jest.fn((...args: unknown[]) => {
      void args;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { address: { address: resolvedAddr } } }),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(resolveRecipient("alice.sui")).resolves.toEqual({
      address: resolvedAddr,
      resolved: "alice.sui",
    });
    // hits the live GraphQL host, not the dead mystenlabs one.
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /graphql\.(test|main)net\.sui\.io\/graphql/
    );
  });

  it("throws when the name does not resolve (data.address null)", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { address: null } }),
      })
    ) as unknown as typeof fetch;
    await expect(resolveRecipient("nope.sui")).rejects.toThrow(/couldn't resolve/i);
  });

  it("throws a clean error (not a raw SyntaxError) when the resolver is non-ok", async () => {
    // A 5xx often returns an HTML error page; without the res.ok guard, res.json()
    // would throw a SyntaxError. We expect the clean, retryable message instead.
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
      })
    ) as unknown as typeof fetch;
    await expect(resolveRecipient("alice.sui")).rejects.toThrow(
      /recipient service unavailable/i
    );
  });
});
