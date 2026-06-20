/**
 * Deep-research subagent smoke (SPEC_AUDRIC_INTELLIGENCE P3 verify).
 * Mirrors lib/ai/tools/deep-research.ts: a deepseek research loop over a
 * self-contained web_search (Sonar) tool. Asserts it actually LOOPS (≥2
 * searches) and returns a substantial CITED synthesis (markdown links).
 *
 * Run: AI_GATEWAY_API_KEY=… pnpm --filter web-v3 exec tsx scripts/deep-research-smoke.mts
 */
import { readFileSync } from "node:fs";
import { gateway, generateText, stepCountIs, tool } from "ai";
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
    /* gateway call fails with a clear auth error */
  }
}

let searchCalls = 0;
const webSearch = tool({
  description:
    "Search the web for current info; returns a grounded summary + source URLs.",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    searchCalls++;
    const { text, sources } = await generateText({
      model: gateway.languageModel("perplexity/sonar"),
      prompt: query,
    });
    const urls = (sources ?? []).flatMap((s) =>
      s.sourceType === "url" ? [{ url: s.url, title: s.title ?? s.url }] : []
    );
    return { answer: text, sources: urls };
  },
});

const task =
  "Compare the top 3 open-source vector databases for a RAG product across performance, scaling, and licensing. Cite sources.";

const { text, steps } = await generateText({
  model: gateway.languageModel("deepseek/deepseek-v3.2"),
  system:
    "You are a research agent. Run MULTIPLE focused web_search calls covering different facets, then write a clear, CITED synthesis with inline markdown links. Never ask questions; research and report.",
  prompt: task,
  tools: { web_search: webSearch },
  stopWhen: stepCountIs(8),
});

const hasLinks = /\]\(https?:\/\//.test(text);
const longEnough = text.length > 400;
console.log(
  `steps=${steps.length} web_search calls=${searchCalls} chars=${text.length} hasLinks=${hasLinks}`
);
console.log(`\n--- findings (head) ---\n${text.slice(0, 500)}\n`);

const pass = searchCalls >= 2 && longEnough && hasLinks;
console.log(
  pass ? "PASS ✅ (looped ≥2 searches + cited synthesis)" : "FAIL ❌"
);
process.exit(pass ? 0 : 1);
