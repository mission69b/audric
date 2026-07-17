import { parseAmountToRaw, SUI_DECIMALS, toRawUnits, USDC_DECIMALS } from "./amount";

describe("toRawUnits", () => {
  it("converts whole SUI to 9-decimal base units", () => {
    expect(toRawUnits(1, SUI_DECIMALS)).toBe(1_000_000_000n);
  });
  it("converts fractional SUI without float drift", () => {
    expect(toRawUnits(0.25, SUI_DECIMALS)).toBe(250_000_000n);
  });
  it("converts USDC at 6 decimals", () => {
    expect(toRawUnits(2.5, USDC_DECIMALS)).toBe(2_500_000n);
  });
  it("rounds to the nearest base unit", () => {
    expect(toRawUnits(0.0000000004, SUI_DECIMALS)).toBe(0n);
    expect(toRawUnits(0.0000000006, SUI_DECIMALS)).toBe(1n);
  });
});

describe("parseAmountToRaw (exact, money-path)", () => {
  const raw = (t: string, d = SUI_DECIMALS) => {
    const r = parseAmountToRaw(t, d);
    if (!r.ok) throw new Error(r.reason);
    return r.raw;
  };

  it("parses whole + fractional SUI exactly", () => {
    expect(raw("1")).toBe(1_000_000_000n);
    expect(raw("0.1")).toBe(100_000_000n);
    expect(raw("0.25")).toBe(250_000_000n);
    expect(raw(".5")).toBe(500_000_000n);
  });

  it("accepts exactly `decimals` fractional digits (1 base unit)", () => {
    expect(raw("0.000000001")).toBe(1n); // 9 dp SUI
    expect(raw("0.000001", USDC_DECIMALS)).toBe(1n); // 6 dp USDC
  });

  it("REJECTS sub-unit precision instead of rounding it up", () => {
    // the bug: 0.0000000015 * 1e9 = 1.5 → Math.round → 2 MIST (wrong amount).
    const r = parseAmountToRaw("0.0000000015", SUI_DECIMALS);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/decimals/i);
  });

  it("rejects >6 decimals for USDC", () => {
    expect(parseAmountToRaw("1.1234567", USDC_DECIMALS).ok).toBe(false);
  });

  it("rejects zero, empty, bare dot, and junk", () => {
    expect(parseAmountToRaw("0", SUI_DECIMALS).ok).toBe(false);
    expect(parseAmountToRaw("0.0", SUI_DECIMALS).ok).toBe(false);
    expect(parseAmountToRaw("", SUI_DECIMALS).ok).toBe(false);
    expect(parseAmountToRaw(".", SUI_DECIMALS).ok).toBe(false);
    expect(parseAmountToRaw("abc", SUI_DECIMALS).ok).toBe(false);
    expect(parseAmountToRaw("1.2.3", SUI_DECIMALS).ok).toBe(false);
  });

  it("has no float drift on values that break Number()*10**d", () => {
    // 0.1 + 0.2 style: exact string math sidesteps binary-float entirely.
    expect(raw("0.3")).toBe(300_000_000n);
    expect(raw("8.1", USDC_DECIMALS)).toBe(8_100_000n);
  });
});
