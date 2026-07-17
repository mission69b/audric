// Base-unit conversion for on-chain amounts. SUI = 9 decimals, USDC/USDsui = 6.
// Uses Math.round on the scaled value to avoid binary-float drift on typical
// human inputs, then BigInt for the exact base-unit integer.
export const SUI_DECIMALS = 9;
export const USDC_DECIMALS = 6;

export function toRawUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("amount must be a finite, non-negative number");
  }
  return BigInt(Math.round(amount * 10 ** decimals));
}

// Parse a human decimal STRING to exact base units. String-based (never via
// `Number()` * 10**decimals) so there is no binary-float drift AND sub-unit
// precision can't silently round into a DIFFERENT amount: "0.0000000015" SUI is
// 1.5 base units, which `Math.round` would turn into 2 MIST — here it is rejected
// because it carries more fractional digits than the asset supports. This is the
// authoritative money conversion for a send; `toRawUnits` remains for display/test
// helpers that start from a number.
export function parseAmountToRaw(
  text: string,
  decimals: number
): { ok: true; raw: bigint } | { ok: false; reason: string } {
  const t = text.trim();
  // digits, at most one dot; reject "", ".", and any stray characters.
  if (t === "" || t === "." || !/^\d*\.?\d*$/.test(t)) {
    return { ok: false, reason: "Enter a valid amount." };
  }
  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) {
    return { ok: false, reason: `Too many decimals — ${decimals} max for this asset.` };
  }
  const raw =
    BigInt(whole === "" ? "0" : whole) * 10n ** BigInt(decimals) +
    BigInt(frac.padEnd(decimals, "0") || "0");
  if (raw <= 0n) {
    return { ok: false, reason: "Enter an amount greater than zero." };
  }
  return { ok: true, raw };
}
