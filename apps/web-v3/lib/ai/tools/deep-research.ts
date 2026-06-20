import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { webSearch } from "./web-search";

/**
 * deep_research — a SUBAGENT (SPEC_AUDRIC_INTELLIGENCE §3b, P3).
 *
 * Runs an isolated research loop: several focused `web_search` calls in its OWN
 * context, then a cited synthesis. The main agent receives only the synthesis
 * (not the dozens of intermediate search results) — keeping the main turn's
 * context clean while doing genuinely deep, multi-source research. This is the
 * free, better replacement for the cut search-based recipes (Market Research /
 * Company Deep-Dive): no fixed pipeline, works for ANY topic, no charge.
 *
 * Cheap research model for the gathering loop; the MAIN turn's model (e.g. Auto
 * → Claude Opus on hard turns) writes the final user-facing answer from the
 * returned brief. Gated on the router's `needsDeepResearch` so it only runs when
 * a turn actually warrants it (see route.ts) — simple lookups use web_search.
 */
const RESEARCH_MODEL = "deepseek/deepseek-v3.2";

export const deepResearch = tool({
  description:
    "Research a question IN DEPTH: runs several focused web searches in an isolated context and returns a cited synthesis. Use for genuinely multi-faceted research — comparing many options, analyzing a market/topic across several dimensions, or cross-referencing multiple sources. For a single fact or a quick lookup, use `web_search` directly instead.",
  inputSchema: z.object({
    task: z
      .string()
      .describe("The research question or task to investigate thoroughly."),
  }),
  execute: async ({ task }, { abortSignal }) => {
    const { text } = await generateText({
      model: getLanguageModel(RESEARCH_MODEL),
      system:
        "You are a research agent. Investigate the task thoroughly: run MULTIPLE focused web_search calls covering different facets of the question, then write a clear, well-structured, CITED synthesis as your final answer — include inline markdown links to the sources you used. Never ask the user questions; research and report. If sources conflict or data is thin, say so.",
      prompt: task,
      tools: { web_search: webSearch },
      stopWhen: stepCountIs(8),
      abortSignal,
    });
    return { findings: text };
  },
});
