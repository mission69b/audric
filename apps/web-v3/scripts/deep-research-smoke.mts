/**
 * Deep-research subagent smoke (SPEC_AUDRIC_INTELLIGENCE P3 verify).
 * Mirrors lib/ai/tools/deep-research.ts: a deepseek research loop over a
 * self-contained web_search (Sonar) tool. Asserts it actually LOOPS (≥2
 * searches) and returns a substantial CITED synthesis (markdown links).
 *
 * Run: AI_GATEWAY_API_KEY=… pnpm --filter web-v3 exec tsx scripts/deep-research-smoke.mts
 */
import { readFileSync } from "node:fs";
import { gateway, generateObject, generateText, stepCountIs, tool } from "ai";
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

let findings = text;

// P4 reflection (evaluator-optimizer) — mirrors lib/ai/tools/deep-research.ts.
const { object: critique } = await generateObject({
  model: gateway.languageModel("deepseek/deepseek-v3.2"),
  schema: z.object({ sound: z.boolean(), issues: z.array(z.string()) }),
  system:
    "You are a strict research editor. Judge the synthesis against the task ONLY on what it contains. Flag uncited/overconfident claims + gaps. Be decisive.",
  prompt: `Task: ${task}\n\nSynthesis:\n${findings}`,
});
let revised = false;
if (!critique.sound && critique.issues.length > 0) {
  const r = await generateText({
    model: gateway.languageModel("deepseek/deepseek-v3.2"),
    system:
      "Improve the synthesis by fixing the listed issues; keep valid content + inline citations; do NOT invent facts.",
    prompt: `Task: ${task}\n\nIssues:\n- ${critique.issues.join("\n- ")}\n\nCurrent:\n${findings}`,
  });
  if (r.text.trim().length > 0) {
    findings = r.text;
    revised = true;
  }
}

const hasLinks = /\]\(https?:\/\//.test(findings);
const longEnough = findings.length > 400;
console.log(
  `steps=${steps.length} web_search=${searchCalls} chars=${findings.length} hasLinks=${hasLinks} | reflection: sound=${critique.sound} issues=${critique.issues.length} revised=${revised}`
);
console.log(`\n--- findings (head) ---\n${findings.slice(0, 500)}\n`);

const pass = searchCalls >= 2 && longEnough && hasLinks;
console.log(
  pass
    ? "PASS ✅ (looped ≥2 searches + cited synthesis + reflection ran)"
    : "FAIL ❌"
);
process.exit(pass ? 0 : 1);
