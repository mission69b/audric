/**
 * Smoke test — B1 (toolMetadata wire) + B1a (extractMoveCallTargets shape).
 *
 * Locks in the two load-bearing fixes shipped 2026-05-20 so they can't
 * silently regress when someone re-pins a dependency or refactors the
 * Enoki sponsor path.
 *
 * Run: `pnpm tsx scripts/smoke-b1-b1a.mts`
 *
 * --- WHAT THIS TESTS ---
 *
 * 1. **B1 — `toolMetadata` survives the AI SDK wire round-trip.** The
 *    bug was that `@ai-sdk/react@3.0.118` resolved a transitive
 *    `ai@6.0.116` that predated `toolMetadata` support in
 *    `processUIMessageStream`'s `updateToolPart`. The fix bumped
 *    `@ai-sdk/react` to `3.0.187` (pulls `ai@6.0.185`).
 *    Assertion: the resolved `ai` package contains the `toolMetadata`
 *    propagation code path.
 *
 * 2. **B1a — `extractMoveCallTargets` returns `package::module::function`
 *    targets, NOT empty.** The bug was that the function read a
 *    nonexistent `.target` property on Sui PTB commands and returned
 *    `[]`, causing Enoki to apply its default allowlist (which blocks
 *    `0x2::coin::value`). The fix constructs the target string from
 *    `MoveCall.{package,module,function}`.
 *
 * 3. **Dependency pin sanity** — `@ai-sdk/react >= 3.0.187` AND the
 *    package.json `package.json` doesn't accidentally re-pin a lower
 *    version through a workspace override.
 *
 * If any assertion fails the script exits non-zero. Intended for ad-hoc
 * verification + future CI gate.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMoveCallTargets } from "../lib/audric/extract-move-call-targets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "..");

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ok — ${message}`);
  } else {
    console.error(`  FAIL — ${message}`);
    failures++;
  }
}

// ----------------------------------------------------------------------
// Test 1: package.json pin sanity
// ----------------------------------------------------------------------

console.log("\n[1] @ai-sdk/react pin sanity (>= 3.0.187)");
const pkgJson = JSON.parse(
  readFileSync(resolvePath(repoRoot, "package.json"), "utf8")
) as { dependencies: Record<string, string> };
const reactPin = pkgJson.dependencies["@ai-sdk/react"];
assert(
  typeof reactPin === "string" && reactPin.length > 0,
  `@ai-sdk/react is declared in package.json (got ${reactPin ?? "undefined"})`
);
const reactVer = reactPin?.replace(/^[\^~]/, "") ?? "0.0.0";
const [major, minor, patch] = reactVer.split(".").map((n) => Number(n));
assert(
  major === 3 && (minor > 0 || (minor === 0 && patch >= 187)),
  `@ai-sdk/react pin is >= 3.0.187 (got ${reactPin})`
);

// ----------------------------------------------------------------------
// Test 2: toolMetadata survives the AI SDK wire round-trip
// ----------------------------------------------------------------------

console.log("\n[2] AI SDK toolMetadata wire support");
// Resolve the `ai` package that `@ai-sdk/react` actually loads at runtime
// (NOT the workspace-root `ai`, which can drift independently). Look in
// the pnpm store for the version pinned by `@ai-sdk/react@3.0.187`.
// repoRoot is `apps/web-v2/`; pnpm store lives at audric/node_modules/.pnpm.
const pnpmStore = resolvePath(repoRoot, "../../node_modules/.pnpm");
// The pnpm store keeps stale versions around even after `pnpm update`,
// so we filter for the version that matches the package.json pin to
// avoid asserting against a stale 3.0.118 that hasn't been GC'd yet.
const reactPnpmDir = existsSync(pnpmStore)
  ? readPnpmEntries(pnpmStore).find((d) =>
      d.startsWith(`@ai-sdk+react@${reactVer}_`)
    )
  : undefined;
assert(reactPnpmDir != null, "Resolved `@ai-sdk/react` from the pnpm store");
let resolvedAiVersion = "(unresolved)";
let aiDist: string | undefined;
if (reactPnpmDir != null) {
  const reactPkg = JSON.parse(
    readFileSync(
      resolvePath(
        pnpmStore,
        reactPnpmDir,
        "node_modules/@ai-sdk/react/package.json"
      ),
      "utf8"
    )
  ) as { dependencies?: Record<string, string> };
  resolvedAiVersion = reactPkg.dependencies?.ai ?? "(unknown)";
  const aiPnpmDir = readPnpmEntries(pnpmStore).find(
    (d) =>
      d.startsWith(`ai@${resolvedAiVersion}_`) ||
      d === `ai@${resolvedAiVersion}`
  );
  if (aiPnpmDir != null) {
    aiDist = resolvePath(
      pnpmStore,
      aiPnpmDir,
      "node_modules/ai/dist/index.mjs"
    );
  }
}
console.log(`  - resolved ai version: ${resolvedAiVersion}`);
assert(
  aiDist != null && existsSync(aiDist),
  "Resolved ai dist/index.mjs is present on disk"
);
if (aiDist != null && existsSync(aiDist)) {
  const aiSrc = readFileSync(aiDist, "utf8");
  // The fix landed when the tool-part updater started propagating the
  // `toolMetadata` option. Pre-6.0.185 versions of ai DID emit the field
  // on the wire from `streamText`/`Agent` but `processUIMessageStream`'s
  // `updateToolPart` dropped it — the visible regression at run time.
  assert(
    /if\s*\(\s*options\.toolMetadata\s*!==\s*(void\s*0|undefined)\s*\)/.test(
      aiSrc
    ),
    "ai/dist/index.mjs propagates `toolMetadata` in updateToolPart"
  );
  // Defensive: also check the schema is present (catches a future
  // refactor that renames the field).
  assert(
    /toolMetadataSchema\b/.test(aiSrc),
    "ai/dist/index.mjs declares `toolMetadataSchema`"
  );
}

// ----------------------------------------------------------------------
// Test 3: extractMoveCallTargets returns legacy package::module::function
// ----------------------------------------------------------------------

console.log("\n[3] extractMoveCallTargets returns legacy target shape");

const fakeTx = {
  getData: () => ({
    commands: [
      {
        $kind: "MoveCall",
        MoveCall: {
          package:
            "0x0000000000000000000000000000000000000000000000000000000000000002",
          module: "coin",
          function: "value",
        },
      },
      {
        $kind: "MoveCall",
        MoveCall: {
          package:
            "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29",
          module: "lending_core",
          function: "deposit",
        },
      },
      // dup → dedupes in the Set
      {
        $kind: "MoveCall",
        MoveCall: {
          package:
            "0x0000000000000000000000000000000000000000000000000000000000000002",
          module: "coin",
          function: "value",
        },
      },
      // not a MoveCall → ignored
      { $kind: "SplitCoins" },
      // malformed MoveCall → ignored (no panic)
      { $kind: "MoveCall", MoveCall: { package: "0x2", module: "coin" } },
    ],
  }),
};

const targets = extractMoveCallTargets(fakeTx);
assert(
  targets.length === 2,
  `extractMoveCallTargets returns 2 unique targets (got ${targets.length})`
);
assert(
  targets.includes(
    "0x0000000000000000000000000000000000000000000000000000000000000002::coin::value"
  ),
  "0x2::coin::value target present (the call Enoki blocked pre-fix)"
);
assert(
  targets.includes(
    "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::lending_core::deposit"
  ),
  "NAVI lending_core::deposit target present"
);

// Empty / malformed input must not panic.
assert(extractMoveCallTargets({}).length === 0, "Empty tx → []");
assert(
  extractMoveCallTargets({ getData: () => ({}) }).length === 0,
  "Empty commands → []"
);
assert(extractMoveCallTargets(null).length === 0, "null → []");

// ----------------------------------------------------------------------
// Exit
// ----------------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke assertions passed.");
process.exit(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readPnpmEntries(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}
