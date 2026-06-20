import { generateObject, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { webSearch } from "./web-search";

/** Strip leaked DeepSeek tool-call delimiter tokens (fullwidth ｜/▁). */
const stripTokens = (t: string) => t.replace(/<｜[^\s<>]*>?\s?/gu, "");

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
    let findings = stripTokens(text);

    // Reflection (P4, evaluator-optimizer — SPEC §3c). A strict editor checks
    // the synthesis for uncited/overconfident claims + gaps; if it's not sound,
    // ONE revise pass. Lives here (not in the streamed chat) because the
    // subagent is non-streaming, so reflection costs no UX responsiveness — it's
    // hidden inside the "Researching in depth…" phase. Fail-open: any error
    // keeps the draft (never block the answer on the self-check).
    try {
      const { object: critique } = await generateObject({
        model: getLanguageModel(RESEARCH_MODEL),
        schema: z.object({
          sound: z
            .boolean()
            .describe(
              "True if the synthesis answers the task, is well-supported with inline citations, balanced, and free of overconfident or uncited claims."
            ),
          issues: z
            .array(z.string())
            .describe(
              "Specific, actionable problems to fix (uncited claims, gaps vs the task, overstated certainty). Empty when sound."
            ),
        }),
        system:
          "You are a strict research editor. Judge the synthesis against the task ONLY on what it contains — do not require new facts. Set sound=false and list issues ONLY for MATERIAL problems (uncited key claims, unsupported/overconfident statements, real gaps versus the task). If it's sound to ship, set sound=true and leave issues EMPTY. Minor wording is never an issue.",
        prompt: `Task: ${task}\n\nSynthesis:\n${findings}`,
        abortSignal,
      });
      if (!critique.sound && critique.issues.length > 0) {
        const { text: revised } = await generateText({
          model: getLanguageModel(RESEARCH_MODEL),
          system:
            "Improve the research synthesis by fixing the listed issues: hedge or remove overconfident/uncited claims, tighten structure, and note any gaps honestly. KEEP all valid content and inline markdown citations. Do NOT invent facts or sources — if a gap can't be closed from the existing material, state it plainly.",
          prompt: `Task: ${task}\n\nIssues to fix:\n- ${critique.issues.join("\n- ")}\n\nCurrent synthesis:\n${findings}`,
          abortSignal,
        });
        const revisedClean = stripTokens(revised);
        if (revisedClean.trim().length > 0) {
          findings = revisedClean;
        }
      }
    } catch {
      /* reflection failed → keep the draft; never block on the self-check */
    }

    return { findings };
  },
});
