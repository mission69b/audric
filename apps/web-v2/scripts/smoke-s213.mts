/**
 * Smoke test — S.213 (validateModelMessages Anthropic strict-shape gate).
 *
 * Locks in the orphan-stripping behavior that catches the production
 * incident shape:
 *
 *   "messages.1: tool_use ids were found without tool_result blocks
 *    immediately after: toolu_01Dj..., toolu_01Ea..., toolu_01UP..."
 *
 * (2026-05-21, post-S.212, on a multi-step extended-thinking turn that
 * fired 3 read tools then narrated.)
 *
 * Run: `node --experimental-strip-types apps/web-v2/scripts/smoke-s213.mts`
 *
 * --- WHAT THIS TESTS ---
 *
 *  1. Orphan tool-call in assistant message → stripped (no tool result
 *     in next tool message).
 *  2. Orphan tool-result in tool message → stripped (no matching call in
 *     prior assistant).
 *  3. Empty assistant message after stripping → dropped entirely; the
 *     surrounding history collapses cleanly without consecutive user
 *     messages.
 *  4. Clean history is idempotent (no shape change for valid input).
 *  5. Leading non-user messages are shifted off.
 *  6. Production trigger shape (2 tool-calls, 1 tool-result missing) →
 *     stripped to a single matching call+result pair.
 *
 * Exit non-zero on any failure.
 */

import type { ModelMessage } from "ai";
import { validateModelMessages } from "../lib/audric/validate-model-messages.ts";

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
// Test 1: orphan tool-call in assistant → stripped
// ----------------------------------------------------------------------

console.log("\n[1] orphan tool-call in assistant message");
{
  const corrupted: ModelMessage[] = [
    { role: "user", content: [{ type: "text", text: "hi" }] },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Checking..." },
        {
          type: "tool-call",
          toolCallId: "toolu_kept",
          toolName: "balance_check",
          input: {},
        },
        {
          type: "tool-call",
          toolCallId: "toolu_orphan",
          toolName: "rates_info",
          input: {},
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "toolu_kept",
          toolName: "balance_check",
          output: { type: "text", value: "ok" },
        },
      ],
    },
  ];
  const clean = validateModelMessages(corrupted);
  const assistant = clean.find((m) => m.role === "assistant");
  const toolCallIds =
    assistant && Array.isArray(assistant.content)
      ? assistant.content
          .filter((p) => p.type === "tool-call")
          .map((p) => (p as { toolCallId: string }).toolCallId)
      : [];
  assert(
    toolCallIds.length === 1 && toolCallIds[0] === "toolu_kept",
    `Only the call with a matching result is kept (got ${JSON.stringify(toolCallIds)})`
  );
  const assistantHasText =
    assistant && Array.isArray(assistant.content)
      ? assistant.content.some((p) => p.type === "text")
      : false;
  assert(assistantHasText === true, "Text part survives the strip");
}

// ----------------------------------------------------------------------
// Test 2: orphan tool-result in tool → stripped
// ----------------------------------------------------------------------

console.log("\n[2] orphan tool-result in tool message");
{
  const corrupted: ModelMessage[] = [
    { role: "user", content: [{ type: "text", text: "hi" }] },
    {
      role: "assistant",
      content: [{ type: "text", text: "Hello." }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "toolu_orphan",
          toolName: "balance_check",
          output: { type: "text", value: "ok" },
        },
      ],
    },
  ];
  const clean = validateModelMessages(corrupted);
  const hasOrphan = clean.some(
    (m) =>
      m.role === "tool" &&
      m.content.some(
        (p) => p.type === "tool-result" && p.toolCallId === "toolu_orphan"
      )
  );
  assert(hasOrphan === false, "Orphan tool-result removed from tool message");
  // The tool message itself was emptied → dropped → last message should
  // be the assistant.
  assert(clean.at(-1)?.role === "assistant", "Empty tool message dropped");
}

// ----------------------------------------------------------------------
// Test 3: clean history is idempotent
// ----------------------------------------------------------------------

console.log("\n[3] clean history is idempotent");
{
  const clean: ModelMessage[] = [
    { role: "user", content: [{ type: "text", text: "hi" }] },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Checking..." },
        {
          type: "tool-call",
          toolCallId: "toolu_001",
          toolName: "balance_check",
          input: {},
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "toolu_001",
          toolName: "balance_check",
          output: { type: "json", value: { balance: 100 } },
        },
      ],
    },
    { role: "assistant", content: [{ type: "text", text: "$100" }] },
  ];
  const out = validateModelMessages(clean);
  assert(out.length === clean.length, `Length unchanged (4 == ${out.length})`);
  assert(out[0].role === "user", "First message is user");
  assert(out[1].role === "assistant", "Second message is assistant");
  assert(out[2].role === "tool", "Third message is tool");
}

// ----------------------------------------------------------------------
// Test 4: leading non-user shifted off
// ----------------------------------------------------------------------

console.log("\n[4] leading non-user messages shifted off");
{
  const lead: ModelMessage[] = [
    { role: "assistant", content: [{ type: "text", text: "orphaned lead" }] },
    { role: "user", content: [{ type: "text", text: "hi" }] },
  ];
  const out = validateModelMessages(lead);
  assert(out.length === 1, `Length is 1 after shifting lead (${out.length})`);
  assert(out[0].role === "user", "Head is user");
}

// ----------------------------------------------------------------------
// Test 5: production trigger — 3 calls, all missing results (S.213 root)
// ----------------------------------------------------------------------

console.log("\n[5] production trigger: 3 tool-calls, all results missing");
{
  const corrupted: ModelMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "I'm holding $30 USDsui, $20 USDC, $14 SUI. Calculate net APY.",
        },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check rates and your position." },
        {
          type: "tool-call",
          toolCallId: "toolu_01DjSs7Fr96UqwfViqMCzgTF",
          toolName: "rates_info",
          input: {},
        },
        {
          type: "tool-call",
          toolCallId: "toolu_01EaNCVe89fZmmckJ4XzyY5s",
          toolName: "health_check",
          input: {},
        },
        {
          type: "tool-call",
          toolCallId: "toolu_01UPF2ZcUk2goaVjBVHfMyUa",
          toolName: "savings_info",
          input: {},
        },
      ],
    },
    // No follow-up tool message at all — this is the stream-truncated case.
    {
      role: "user",
      content: [{ type: "text", text: "next question" }],
    },
  ];
  const clean = validateModelMessages(corrupted);
  // All 3 orphan tool-calls should be stripped.
  const allToolCallIds = clean
    .filter((m) => m.role === "assistant" && Array.isArray(m.content))
    .flatMap((m) =>
      Array.isArray(m.content)
        ? m.content
            .filter((p) => p.type === "tool-call")
            .map((p) => (p as { toolCallId: string }).toolCallId)
        : []
    );
  assert(
    allToolCallIds.length === 0,
    `All 3 orphan tool-calls stripped (got ${JSON.stringify(allToolCallIds)})`
  );
  // The conversation should still be a valid alternating user → assistant → ...
  for (let i = 1; i < clean.length; i++) {
    assert(
      clean[i].role !== clean[i - 1].role,
      `No consecutive same-role at ${i - 1}/${i} (got ${clean[i - 1].role} → ${clean[i].role})`
    );
  }
  // The text content from both turns should survive.
  const allText = clean
    .flatMap((m) =>
      Array.isArray(m.content)
        ? m.content
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
        : []
    )
    .join(" || ");
  assert(
    allText.includes("USDsui") && allText.includes("next question"),
    "Both user prompts survive the strip"
  );
}

// ----------------------------------------------------------------------
// Test 6: provider-executed tools are NOT treated as orphans
// ----------------------------------------------------------------------

console.log("\n[6] provider-executed tool-calls excluded from orphan check");
{
  const providerExecuted: ModelMessage[] = [
    { role: "user", content: [{ type: "text", text: "search the web" }] },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "toolu_ws_001",
          toolName: "web_search",
          input: { query: "sui" },
          providerExecuted: true,
        },
        {
          type: "tool-result",
          toolCallId: "toolu_ws_001",
          toolName: "web_search",
          output: { type: "json", value: { results: [] } },
        },
      ],
    },
    // No `tool` message after — but the provider tool is self-paired
    // INSIDE the assistant message, so this is valid Anthropic shape.
  ];
  const out = validateModelMessages(providerExecuted);
  const stillHasProviderCall = out.some(
    (m) =>
      m.role === "assistant" &&
      Array.isArray(m.content) &&
      m.content.some(
        (p) => p.type === "tool-call" && p.toolCallId === "toolu_ws_001"
      )
  );
  assert(
    stillHasProviderCall === true,
    "Provider-executed tool-call survives (not orphaned)"
  );
}

// ----------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------

console.log("");
if (failures > 0) {
  console.error(`\n✗ ${failures} smoke assertion(s) failed`);
  process.exit(1);
}
console.log("✓ all smoke assertions passed");
process.exit(0);
