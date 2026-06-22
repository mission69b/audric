/**
 * Cross-model tool-loop smoke (Audric v3) — stop the whack-a-mole.
 *
 * Drives the exact failure-prone turn — a recipe result the model must
 * synthesize into ONE artifact — across EVERY chat model, and asserts the
 * model-agnostic invariants instead of discovering per-model quirks in prod:
 *
 *   1. createDocument is called EXACTLY once   (no duplicate artifact)
 *   2. updateDocument / editDocument / requestSuggestions are NEVER chained
 *      after it                                 (the duplicate-artifact class)
 *   3. the turn doesn't error
 *
 * Uses call-counting MOCK tools (no real artifact gen / payments) + the SAME
 * prepareStep guard as the chat route. Runs each model WITH the guard (gates
 * the exit code) and WITHOUT it (informational — shows which models would
 * duplicate unguarded). Self-contained (no app-module imports — Node/tsx ESM
 * can't resolve the app's path aliases cleanly); the constants below MIRROR
 * lib/ai/models.ts, lib/ai/prompts.ts (artifactsPrompt) and the
 * market_research recipe in lib/recipes/catalog.ts — keep them in sync.
 *
 * Run:
 *   AI_GATEWAY_API_KEY=… pnpm --filter web-v3 exec tsx scripts/model-matrix-smoke.mts
 */
import { readFileSync } from "node:fs";
import { gateway, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

// Best-effort: load AI_GATEWAY_API_KEY from .env.local so `pnpm smoke:models`
// works without exporting it (a raw tsx script doesn't load Next's env).
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
    /* fall through — the gateway call will fail with a clear auth error */
  }
}

// MIRRORS lib/ai/models.ts (the gateway chat models; confidential/TEE excluded
// — they route to RedPill, not the gateway).
const MODEL_IDS = [
  "moonshotai/kimi-k2.5",
  "deepseek/deepseek-v3.2",
  "xai/grok-4.1-fast-non-reasoning",
  "openai/gpt-oss-120b",
  "anthropic/claude-opus-4.8",
  "openai/gpt-5.5",
];

// MIRRORS route.ts DOC_MUTATION_TOOLS + the prepareStep guard.
const DOC_MUTATION_TOOLS = new Set([
  "createDocument",
  "updateDocument",
  "editDocument",
  "requestSuggestions",
]);

const topic = "AI code assistants";

// MIRRORS the artifactsPrompt rules + the recipe synthesis guidance in
// lib/ai/prompts.ts (the behaviorally-relevant part).
const SYSTEM = `You are Audric. You can create artifacts (documents/scripts/sheets) shown in a side panel.
CRITICAL RULES:
1. Only call ONE tool per response. After calling any create/edit/update tool, STOP. Do not chain tools.
2. Include ALL content in the createDocument call. Do not create then edit.
3. NEVER use editDocument/updateDocument immediately after creating an artifact or in the same response as createDocument.
When a recipe returns, follow the result's \`instruction\`: synthesize the \`data\` into a document via createDocument (ONCE). Then reply with a 1-2 sentence confirmation.`;

// MIRRORS lib/recipes/catalog.ts market_research synthesisInstruction.
const instruction =
  `Write a "${topic} — Market Research" document with createDocument (kind: text). Use ONLY the provided data and cite sources inline as markdown links where available. Structure it as:\n` +
  "- **Overview** — what this market is and why it matters.\n" +
  "- **Size & growth** — figures only if present in the data; never invent numbers.\n" +
  "- **Key players** — the notable companies/products named across the sources.\n" +
  "- **Trends** — the most important current dynamics.\n" +
  "- **Recent developments** — 3–5 dated news items with sources.\n" +
  "- **Takeaway** — a neutral 2–3 sentence synthesis.\n" +
  "If a section's data is missing, say so briefly rather than guessing.";

const recipeResult = {
  recipeId: "market_research",
  recipeName: "Market Research",
  data: {
    overview: {
      choices: [
        {
          message: {
            content:
              "The AI code assistant market is ~$5B in 2024, projected to ~$47B by 2034 (~24% CAGR). Leaders: GitHub Copilot, Cursor, Gemini Code Assist, Amazon Q. Trend: shift to agentic workflows. [1][2]",
          },
        },
      ],
      citations: ["https://example.com/a", "https://example.com/b"],
    },
    web: {
      web: {
        results: [
          {
            title: "AI code market",
            url: "https://example.com/m",
            description: "Market size + players.",
          },
        ],
      },
    },
    deep: {
      results: [
        { title: "Competitive landscape", url: "https://example.com/c" },
      ],
    },
    news: {
      results: [
        {
          title: "Cursor hits $2B ARR",
          url: "https://example.com/n",
          description: "2026 milestone.",
        },
      ],
    },
  },
  steps: [
    {
      key: "overview",
      label: "Cited market overview",
      service: "Perplexity",
      ok: true,
      cost: 0.02,
    },
    {
      key: "web",
      label: "Web results",
      service: "Brave Search",
      ok: true,
      cost: 0.02,
    },
    {
      key: "deep",
      label: "Semantic sources",
      service: "Exa",
      ok: true,
      cost: 0.02,
    },
    {
      key: "news",
      label: "Recent news",
      service: "Brave Search",
      ok: true,
      cost: 0.02,
    },
  ],
  paidUsd: 0.08,
  quotedUsd: 0.08,
  partial: false,
  instruction,
};

type Counts = {
  createDocument: number;
  updateDocument: number;
  editDocument: number;
  requestSuggestions: number;
};

function makeTools(counts: Counts) {
  return {
    web_search: tool({
      description: "Search the web.",
      inputSchema: z.object({ query: z.string() }),
      execute: () => ({ results: [] }),
    }),
    createDocument: tool({
      description:
        "Create an artifact. kind: 'text' for documents, 'code' for scripts, 'sheet' for data.",
      inputSchema: z.object({
        title: z.string(),
        kind: z.enum(["text", "code", "sheet", "image"]),
      }),
      execute: ({ title, kind }) => {
        counts.createDocument++;
        return {
          id: "doc-1",
          title,
          kind,
          content:
            `The ${kind === "code" ? "script" : "document"} is complete and fully written from the provided data — it is now visible to the user. ` +
            "Do NOT call updateDocument, editDocument, or createDocument again for it unless the user explicitly asks for a change. Reply with only a 1-2 sentence confirmation.",
        };
      },
    }),
    updateDocument: tool({
      description: "Full rewrite of an existing document.",
      inputSchema: z.object({ id: z.string(), description: z.string() }),
      execute: () => {
        counts.updateDocument++;
        return { id: "doc-1", content: "updated" };
      },
    }),
    editDocument: tool({
      description: "Targeted find-and-replace edit of a document.",
      inputSchema: z.object({
        id: z.string(),
        old_string: z.string(),
        new_string: z.string(),
      }),
      execute: () => {
        counts.editDocument++;
        return { id: "doc-1", content: "edited" };
      },
    }),
    requestSuggestions: tool({
      description: "Suggest edits for an existing document.",
      inputSchema: z.object({ documentId: z.string() }),
      execute: () => {
        counts.requestSuggestions++;
        return { suggestions: [] };
      },
    }),
  };
}

const ACTIVE_TOOLS = [
  "web_search",
  "createDocument",
  "updateDocument",
  "editDocument",
  "requestSuggestions",
] as const;

const messages = [
  {
    role: "user" as const,
    content: `Run the Market Research recipe (topic: ${topic})`,
  },
  {
    role: "assistant" as const,
    content: [
      {
        type: "tool-call" as const,
        toolCallId: "rc1",
        toolName: "run_recipe",
        input: { recipeId: "market_research", inputs: { topic } },
      },
    ],
  },
  {
    role: "tool" as const,
    content: [
      {
        type: "tool-result" as const,
        toolCallId: "rc1",
        toolName: "run_recipe",
        output: { type: "json" as const, value: recipeResult },
      },
    ],
  },
];

async function runOne(modelId: string, withGuard: boolean) {
  const counts: Counts = {
    createDocument: 0,
    updateDocument: 0,
    editDocument: 0,
    requestSuggestions: 0,
  };
  let error: string | undefined;
  try {
    await generateText({
      model: gateway.languageModel(modelId),
      system: SYSTEM,
      messages,
      tools: makeTools(counts),
      stopWhen: stepCountIs(5),
      experimental_activeTools: [...ACTIVE_TOOLS],
      prepareStep: ({ steps }) => {
        if (!withGuard) {
          return {};
        }
        const used = steps.some((s) =>
          s.toolCalls?.some((tc) =>
            DOC_MUTATION_TOOLS.has(tc?.toolName as string)
          )
        );
        return used
          ? {
              activeTools: ACTIVE_TOOLS.filter(
                (t) => !DOC_MUTATION_TOOLS.has(t)
              ),
            }
          : {};
      },
    });
  } catch (e) {
    error = (e as Error).message;
  }
  return { counts, error };
}

const PASS = (c: Counts) =>
  c.createDocument === 1 &&
  c.updateDocument === 0 &&
  c.editDocument === 0 &&
  c.requestSuggestions === 0;

const fmt = (r: { counts: Counts; error?: string }) =>
  r.error
    ? `ERROR ${r.error.slice(0, 40)}`
    : `c=${r.counts.createDocument} u=${r.counts.updateDocument} e=${r.counts.editDocument} s=${r.counts.requestSuggestions}`;

let failures = 0;
console.log(`Cross-model tool-loop smoke — ${MODEL_IDS.length} models\n`);
for (const id of MODEL_IDS) {
  const guarded = await runOne(id, true);
  const unguarded = await runOne(id, false);
  const ok = PASS(guarded.counts) && !guarded.error;
  if (!ok) {
    failures++;
  }
  console.log(
    `${ok ? "✅" : "❌"} ${id.padEnd(34)} guarded[${fmt(guarded)}]  unguarded[${fmt(unguarded)}]`
  );
}

console.log(
  `\n${failures === 0 ? "ALL PASS ✅" : `${failures} FAILED ❌`} (guarded invariant: createDocument=1, no chained update/edit/suggest)`
);
process.exit(failures === 0 ? 0 : 1);
