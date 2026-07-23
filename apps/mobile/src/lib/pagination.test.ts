import { resolveLimit } from "./pagination";

const DEFAULT = 20;
const MAX = 50;
const resolve = (raw: string | null) => resolveLimit(raw, DEFAULT, MAX);

describe("resolveLimit", () => {
  it("falls back to the default when the param is absent", () => {
    // The regression from AUDIT-2026-07-20.md #6: `Number(null)` is 0, which is
    // finite, so an isFinite-only test clamped this to 1 instead of the default.
    expect(resolve(null)).toBe(DEFAULT);
  });

  it("falls back to the default for zero, negative and junk", () => {
    expect(resolve("0")).toBe(DEFAULT);
    expect(resolve("-5")).toBe(DEFAULT);
    expect(resolve("")).toBe(DEFAULT);
    expect(resolve("abc")).toBe(DEFAULT);
  });

  it("honours a valid in-range limit", () => {
    expect(resolve("5")).toBe(5);
  });

  it("caps at the maximum", () => {
    expect(resolve("999")).toBe(MAX);
  });

  it("truncates a fractional limit rather than rounding up", () => {
    expect(resolve("7.9")).toBe(7);
  });
});
