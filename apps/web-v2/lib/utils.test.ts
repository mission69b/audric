/**
 * [v0.7e Phase 2.0 — S.252 vitest spike] Smoke test that proves:
 *   1. vitest runs in web-v2 (infra works)
 *   2. @/ path alias resolves (mirrors apps/web tsconfig.paths)
 *   3. vitest.setup.ts env preload doesn't break collection
 *
 * Scope-limited to pure functions from `lib/utils.ts` (cn,
 * sanitizeText, generateUUID) — does NOT exercise the engine layer
 * (that ports in Phase 2.1 alongside the bulk `git mv`).
 *
 * KEEP this test through Phase 2.1+. It's the canary for the vitest
 * infra; if it ever fails post-migration, vitest config drifted.
 */

import { describe, expect, it } from "vitest";
import { cn, generateUUID, sanitizeText } from "@/lib/utils";

describe("lib/utils — Phase 2.0 vitest smoke", () => {
  describe("cn (clsx + tailwind-merge)", () => {
    it("merges classnames", () => {
      expect(cn("px-2", "py-1")).toBe("px-2 py-1");
    });

    it("tailwind-merge dedupes conflicting utilities (last wins)", () => {
      expect(cn("px-2", "px-4")).toBe("px-4");
    });

    it("filters falsy values", () => {
      expect(cn("px-2", false, null, undefined, "py-1")).toBe("px-2 py-1");
    });
  });

  describe("sanitizeText", () => {
    it("strips the literal <has_function_call> sentinel", () => {
      expect(sanitizeText("hello <has_function_call> world")).toBe(
        "hello  world"
      );
    });

    it("leaves text without the sentinel unchanged", () => {
      expect(sanitizeText("plain text")).toBe("plain text");
    });
  });

  describe("generateUUID", () => {
    it("produces a v4-shaped UUID", () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it("produces unique values across calls (statistical, not crypto)", () => {
      const set = new Set<string>();
      for (let i = 0; i < 100; i++) {
        set.add(generateUUID());
      }
      expect(set.size).toBe(100);
    });
  });
});
