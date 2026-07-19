/**
 * Deterministic eval for the t2000/auto coding-profile router
 * (`lib/api/router.ts`). No LLM, no network — signal heuristics only.
 * Grows from real Step-0 dogfood traffic: every misroute becomes a case.
 *
 *   pnpm eval:api-router
 *
 * Exit 0 = every case routes as expected. Grow this set from real Step-0
 * dogfood traffic (misroutes become cases).
 */
import {
  ROUTER_BULK_MODEL,
  ROUTER_FRONTIER_MODEL,
  ROUTER_OPEN_BULK_MODEL,
  ROUTER_OPEN_ESCALATION_MODEL,
  type RouteReason,
  resolveRouterModel,
} from "../lib/api/router";

type Msg = { role: "user" | "assistant"; content: string };
type Case = {
  name: string;
  modelId: "t2000/auto" | "t2000/auto-open";
  messages: Msg[];
  system?: string;
  expectServed: string;
  expectReason: RouteReason;
};

const u = (content: string): Msg => ({ role: "user", content });
const a = (content: string): Msg => ({ role: "assistant", content });

const cases: Case[] = [
  // ── bulk (the 70–80%) ──────────────────────────────────────────────────────
  {
    name: "simple edit request",
    modelId: "t2000/auto",
    messages: [u("Rename the `getUser` function to `fetchUser` across src/")],
    expectServed: ROUTER_BULK_MODEL,
    expectReason: "bulk",
  },
  {
    name: "test loop step (first attempt — no retry signal yet)",
    modelId: "t2000/auto",
    messages: [u("Run the test suite and fix the lint warnings in utils.ts")],
    expectServed: ROUTER_BULK_MODEL,
    expectReason: "bulk",
  },
  {
    name: "tool-call style short turn",
    modelId: "t2000/auto",
    messages: [
      u("Apply this diff to config.ts and update the import paths"),
      a("Done. The imports in config.ts now point at lib/core."),
      u("Now do the same for server.ts"),
    ],
    expectServed: ROUTER_BULK_MODEL,
    expectReason: "bulk",
  },
  {
    name: "failure words WITHOUT enough assistant turns stay bulk",
    modelId: "t2000/auto",
    messages: [u("The build is failing with a TypeError in foo.ts — fix it")],
    expectServed: ROUTER_BULK_MODEL,
    expectReason: "bulk",
  },
  {
    // The 2026-07-20 flip: auto-open bulk serves on Kimi K2.7 Code, not GLM.
    // A whole-app build spec is bulk (fresh request, implementation phrasing).
    name: "auto-open bulk serves the open coding model",
    modelId: "t2000/auto-open",
    messages: [
      u(
        "Scaffold a Vite + React + TypeScript app in the current directory, then implement the landing page spec exactly. Install tailwindcss and framer-motion."
      ),
    ],
    expectServed: ROUTER_OPEN_BULK_MODEL,
    expectReason: "bulk",
  },
  // ── retry-after-failure (the strongest escalation signal) ─────────────────
  {
    name: "still failing after two attempts",
    modelId: "t2000/auto",
    messages: [
      u("Make the auth tests pass"),
      a("I updated the token refresh logic; tests should pass now."),
      u("3 tests still failing"),
      a("Adjusted the mock clock in the test setup."),
      u("Still failing — same AssertionError: expected 200, received 401"),
    ],
    expectServed: ROUTER_FRONTIER_MODEL,
    expectReason: "retry-after-failure",
  },
  {
    name: "auto-open retry escalates to the open reasoner, never frontier",
    modelId: "t2000/auto-open",
    messages: [
      u("Fix the flaky websocket reconnect test"),
      a("Increased the reconnect backoff window."),
      u("Ran it again — FAILED. Traceback: ECONNRESET in ws.test.ts"),
      a("Pinned the mock server port."),
      u("It still doesn't pass, same error again"),
    ],
    expectServed: ROUTER_OPEN_ESCALATION_MODEL,
    expectReason: "retry-after-failure",
  },
  // ── plan / architecture phrasing ───────────────────────────────────────────
  {
    name: "architecture question",
    modelId: "t2000/auto",
    messages: [
      u(
        "How should we structure the migration from the monolith API to per-service routers? Walk me through the trade-offs."
      ),
    ],
    expectServed: ROUTER_FRONTIER_MODEL,
    expectReason: "plan-architecture",
  },
  {
    name: "design-doc request on auto-open stays open",
    modelId: "t2000/auto-open",
    messages: [u("Write a design doc for the new caching layer")],
    expectServed: ROUTER_OPEN_ESCALATION_MODEL,
    expectReason: "plan-architecture",
  },
  // ── long context ───────────────────────────────────────────────────────────
  {
    name: "very long context escalates",
    modelId: "t2000/auto",
    messages: [u(`Summarize the changes needed:\n${"x".repeat(400_000)}`)],
    expectServed: ROUTER_FRONTIER_MODEL,
    expectReason: "long-context",
  },
  {
    name: "long context via system prompt counts too",
    modelId: "t2000/auto-open",
    system: "y".repeat(400_000),
    messages: [u("Fix the failing import")],
    expectServed: ROUTER_OPEN_ESCALATION_MODEL,
    expectReason: "long-context",
  },
];

let failures = 0;
for (const c of cases) {
  const got = resolveRouterModel({
    modelId: c.modelId,
    messages: c.messages,
    system: c.system,
  });
  const pass = got.served === c.expectServed && got.reason === c.expectReason;
  if (pass) {
    console.log(`✓ ${c.name} → ${got.served} (${got.reason})`);
  } else {
    failures++;
    console.error(
      `✗ ${c.name}\n    expected ${c.expectServed} (${c.expectReason})\n    got      ${got.served} (${got.reason})`
    );
  }
}

console.log(`\n${cases.length - failures}/${cases.length} routing cases pass`);
process.exit(failures === 0 ? 0 : 1);
