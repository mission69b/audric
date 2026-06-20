/**
 * Router classifier eval (SPEC_AUDRIC_INTELLIGENCE P1 verify bar).
 *
 * Runs the SAME classify the router uses (free model + the same schema/prompt)
 * against labeled prompts and checks the directional invariant — trivial is
 * never 'hard', hard is never 'trivial' — plus reports tier accuracy + which
 * model `pickModel` would choose. Self-contained (Node/tsx ESM can't resolve the
 * app's env-gated path aliases); the schema/prompt/pick MIRROR
 * lib/ai/intelligence/router.ts — keep in sync.
 *
 * Run: AI_GATEWAY_API_KEY=… pnpm --filter web-v3 exec tsx scripts/router-eval.mts
 */
import { readFileSync } from "node:fs";
import { gateway, generateObject } from "ai";
import { z } from "zod";

if (!process.env.AI_GATEWAY_API_KEY) {
  try {
    for (const line of readFileSync(
      `${import.meta.dirname}/../.env.local`,
      "utf8"
    ).split("\n")) {
      const i = line.indexOf("=");
      if (line.slice(0, i).trim() === "AI_GATEWAY_API_KEY") {
        process.env.AI_GATEWAY_API_KEY = line
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* gateway call will fail with a clear auth error */
  }
}

// Mirrors lib/ai/intelligence/router.ts (Kimi can't do generateObject).
const CLASSIFIER_MODEL =
  process.env.CLASSIFIER_MODEL ?? "deepseek/deepseek-v3.2";

const schema = z.object({
  intent: z
    .enum(["chat", "research", "money", "code", "image"])
    .describe("The user's primary goal this turn."),
  complexity: z
    .enum(["trivial", "standard", "hard"])
    .describe(
      "trivial = greeting / one-liner / lookup. standard = normal Q&A or a single tool call. hard = genuine multi-step reasoning, analysis, non-trivial coding, or research."
    ),
  needsDeepResearch: z
    .boolean()
    .describe(
      "True only if it needs gathering AND synthesizing multiple live sources."
    ),
});

const SYSTEM =
  "You are a routing classifier for an AI assistant. Classify ONLY the user's latest message so the system can pick the right model, effort, and step budget. Be decisive. Most everyday messages are 'standard'. Reserve 'hard' for genuine multi-step reasoning, analysis, non-trivial coding, or research. Do not answer the message.";

// MIRRORS lib/ai/intelligence/router.ts pickModel against the full premium pool.
const POOL = [
  { id: "moonshotai/kimi-k2.5", free: true, frontier: false },
  { id: "deepseek/deepseek-v3.2", free: false, frontier: false },
  { id: "xai/grok-4.1-fast-non-reasoning", free: false, frontier: false },
  { id: "openai/gpt-oss-120b", free: false, frontier: false },
  { id: "anthropic/claude-opus-4.8", free: false, frontier: true },
  { id: "openai/gpt-5.5", free: false, frontier: true },
  { id: "google/gemini-3-pro-preview", free: false, frontier: true },
];
function pick(complexity: string): string {
  const free = POOL.find((m) => m.free) ?? POOL[0];
  if (complexity === "trivial") {
    return free.id;
  }
  if (complexity === "hard") {
    return (POOL.find((m) => m.frontier) ?? free).id;
  }
  return (POOL.find((m) => !m.free && !m.frontier) ?? free).id;
}

const CASES: { prompt: string; expect: "trivial" | "standard" | "hard" }[] = [
  { prompt: "hi", expect: "trivial" },
  { prompt: "thanks!", expect: "trivial" },
  { prompt: "what's 2 + 2?", expect: "trivial" },
  { prompt: "what's the weather in Tokyo today?", expect: "standard" },
  { prompt: "explain how JWT authentication works", expect: "standard" },
  { prompt: "write a short haiku about the sea", expect: "standard" },
  { prompt: "send 5 USDC to alice.sui", expect: "standard" },
  {
    prompt:
      "analyze the competitive landscape of the AI code assistant market and recommend a positioning for a new entrant",
    expect: "hard",
  },
  {
    prompt:
      "design a distributed rate limiter and discuss the consistency/latency tradeoffs of each approach",
    expect: "hard",
  },
  {
    prompt:
      "research and compare the top 3 vector databases for a RAG product, with sources",
    expect: "hard",
  },
];

let violations = 0;
let correct = 0;
console.log(`Router classifier eval — ${CASES.length} labeled prompts\n`);
for (const c of CASES) {
  let got = "?";
  let intent = "?";
  try {
    const { object } = await generateObject({
      model: gateway.languageModel(CLASSIFIER_MODEL),
      schema,
      system: SYSTEM,
      prompt: c.prompt,
    });
    got = object.complexity;
    intent = object.intent;
  } catch (e) {
    got = `ERROR ${(e as Error).message.slice(0, 30)}`;
  }
  // Directional invariant: trivial must not be hard; hard must not be trivial.
  const violated =
    (c.expect === "trivial" && got === "hard") ||
    (c.expect === "hard" && got === "trivial");
  if (violated) {
    violations++;
  }
  if (got === c.expect) {
    correct++;
  }
  console.log(
    `${violated ? "❌" : got === c.expect ? "✅" : "≈ "} expect=${c.expect.padEnd(8)} got=${got.padEnd(8)} intent=${intent.padEnd(8)} → ${pick(got)}   "${c.prompt.slice(0, 50)}"`
  );
}

console.log(
  `\naccuracy ${correct}/${CASES.length} · directional violations ${violations}`
);
console.log(
  violations === 0 ? "PASS ✅ (no trivial→hard / hard→trivial)" : "FAIL ❌"
);
process.exit(violations === 0 ? 0 : 1);
