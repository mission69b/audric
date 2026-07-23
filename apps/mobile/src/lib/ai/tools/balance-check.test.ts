import { balanceCheck } from "./balance-check";

// `@t2000/sdk` and `@mysten/sui/grpc` are ESM that jest can't transform, and these
// tests deliberately never reach a real RPC — the point is the GUARDS that run before
// any network call: whose address gets read, and what happens when there isn't one.
const mockQueryBalance = jest.fn();
jest.mock("@mysten/sui/grpc", () => ({ SuiGrpcClient: class {} }));
// `ai` is ESM too; `tool()` is a pass-through definition builder at runtime, so an
// identity mock preserves exactly the shape under test (description/inputSchema/execute).
jest.mock("ai", () => ({ tool: (cfg: unknown) => cfg }));
jest.mock("@t2000/sdk", () => ({
  queryBalance: (...args: unknown[]) => mockQueryBalance(...args),
}));

const VALID = `0x${"cc".repeat(32)}`;

// `tool()` returns the definition; `execute` is what the model would invoke.
const run = (address: string | null) => {
  const t = balanceCheck(address) as unknown as {
    execute: (input: unknown, opts: unknown) => Promise<Record<string, unknown>>;
  };
  return t.execute({}, {});
};

describe("balance_check", () => {
  beforeEach(() => mockQueryBalance.mockReset());

  it("reports no wallet for a guest, without touching the chain", async () => {
    const out = await run(null);
    expect(out.connected).toBe(false);
    expect(mockQueryBalance).not.toHaveBeenCalled();
  });

  it("reports no wallet for a malformed address rather than querying it", async () => {
    const out = await run("not-an-address");
    expect(out.connected).toBe(false);
    expect(mockQueryBalance).not.toHaveBeenCalled();
  });

  it("reads the BOUND address — the model cannot choose whose balance is read", async () => {
    mockQueryBalance.mockResolvedValue({
      stables: { USDC: 12.5 },
      sui: { amount: 0.85 },
      totalUsd: 12.5,
    });
    const out = await run(VALID);
    expect(out).toMatchObject({ connected: true, usdc: 12.5, sui: 0.85 });
    // Second arg is the address the SDK reads — it must be the bound one.
    expect(mockQueryBalance).toHaveBeenCalledWith(expect.anything(), VALID);
  });

  it("surfaces a read failure instead of returning a null the model could fill in", async () => {
    mockQueryBalance.mockRejectedValue(new Error("rpc down"));
    const out = await run(VALID);
    // No numeric fields at all — a null `usdc` would invite an invented figure.
    expect(out.usdc).toBeUndefined();
    expect(String(out.error)).toMatch(/do not estimate or guess/i);
  });
});
