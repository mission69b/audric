import { tool } from "ai";
import { z } from "zod";

/**
 * ask_user — a structured clarifying-question form (Venice-style).
 *
 * CLIENT-EXECUTED: no server `execute`. When a request is underspecified, the
 * model calls this with 1-3 short questions (radio options and/or free text);
 * the client renders a form (`components/chat/ask-user-tool.tsx`), the user
 * answers, and the answers come back via `addToolResult`. The model then
 * proceeds with the task.
 *
 * Prefer this over a prose question when the choice is concrete (e.g. "new image
 * or edit the existing one?", or "what topic, and which angle?"). Use the FEWEST
 * questions needed — often one. Don't use it for requests that are already
 * specific; just do those.
 */
export const askUser = tool({
  description:
    "Ask the user 1-3 short clarifying questions as a STRUCTURED FORM (radio options and/or a text field) when a request is underspecified — e.g. before generating an image ('a new image, or edit the existing one?') or starting research ('what topic, and any particular angle?'). Prefer this over a prose question when the choices are concrete. Keep it to the FEWEST questions needed (often one). The user's answers return as the tool result; then proceed with the task. Do NOT use it when the request is already specific — just do it.",
  inputSchema: z.object({
    intro: z
      .string()
      .optional()
      .describe(
        "One short sentence shown above the questions (e.g. 'A couple of quick questions to tailor this.'). Optional."
      ),
    questions: z
      .array(
        z.object({
          id: z
            .string()
            .describe("Stable key for this question (e.g. 'topic', 'mode')."),
          question: z.string().describe("The question text shown to the user."),
          options: z
            .array(z.string())
            .optional()
            .describe(
              "Selectable choices → rendered as radio buttons. Omit for a free-text question."
            ),
          allowOther: z
            .boolean()
            .optional()
            .describe(
              "If true (with options), add a free-text 'Other' choice for answers outside the list."
            ),
          placeholder: z
            .string()
            .optional()
            .describe("Placeholder text for a free-text question."),
        })
      )
      .min(1)
      .max(3)
      .describe("1-3 clarifying questions. Fewer is better."),
  }),
  // NO execute — client renders the form; answers returned via addToolResult.
});
