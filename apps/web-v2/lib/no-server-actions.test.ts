/**
 * Contract test — `"use server"` directive ban.
 *
 * **Why this exists (S.269 item 2 — 2026-05-23 / S.270 fix).**
 *
 * Audric's auth model attaches the zkLogin JWT as a custom
 * `x-zklogin-jwt` request header (set by `authFetch`). Next.js Server
 * Actions are called via the React server-action RPC channel, which
 * does NOT forward custom request headers from the client. Result:
 * `getCurrentUser()` inside any Server Action sees no JWT and rejects
 * with "Unauthorized" — the exact bug surfaced on the visibility
 * toggle (S.270, fixed by routing through `PATCH /api/chat/[id]`
 * instead).
 *
 * Biome doesn't ship a built-in rule that bans the `"use server"`
 * directive, so we enforce the contract via this vitest test instead.
 * Same posture as the v0.7e canonical-portfolio enforcement: a CI
 * test trumps a never-written-because-the-tool-doesn't-support-it
 * lint rule.
 *
 * **If this test fails:** delete the `"use server"` directive and
 * route the call through `authFetch → API route` so `x-zklogin-jwt`
 * lands. Server Actions are NOT compatible with audric's auth model.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_V2_ROOT = join(import.meta.dirname, "..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"] as const;
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "generated",
  "ai-elements",
  "elements",
  "ui",
  "audric/cards",
  "landing",
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (
      st.isFile() &&
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !entry.endsWith(".d.ts")
    ) {
      yield full;
    }
  }
}

describe('S.269 item 2 — `"use server"` directive ban', () => {
  it('no .ts/.tsx file in audric/web-v2 declares "use server"', () => {
    const offenders: string[] = [];

    for (const subdir of SCAN_DIRS) {
      const root = join(WEB_V2_ROOT, subdir);
      try {
        statSync(root);
      } catch {
        continue;
      }
      for (const file of walk(root)) {
        const contents = readFileSync(file, "utf8");
        // Match `"use server"` or `'use server'` as a directive (top of
        // file or top of function). Allow leading whitespace + comments.
        const directivePattern = /(^|\n)\s*["']use server["']\s*;?/;
        if (directivePattern.test(contents)) {
          offenders.push(relative(WEB_V2_ROOT, file));
        }
      }
    }

    expect(
      offenders,
      `Found "use server" directives in:\n  ${offenders.join("\n  ")}\n\nServer Actions are banned in audric/web-v2 because they don't forward the x-zklogin-jwt custom header — every call would 401. Convert to an API route + authFetch instead. See S.269 item 2.`
    ).toEqual([]);
  });
});
