import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";

export const maxDuration = 15;

// Fast, non-reasoning model for sub-second follow-up generation — the chips
// appear AFTER the main turn finishes, so a "thinking" model here adds a
// noticeable lag. Grok-fast has no reasoning step and routes quickly; the
// server-side cost is a fraction of a cent per turn.
const FOLLOWUP_MODEL = "xai/grok-4.1-fast-non-reasoning";

// Lightweight follow-up generator: given the last exchange, emit 3 short
// first-person follow-ups the user might send next. Degrades to [] on any
// failure — never throws, never blocks the chat. Surfaced as clickable
// Suggestion chips below the assistant message.
export async function POST(request: Request) {
  let context = "";
  try {
    const body = await request.json();
    context = typeof body?.context === "string" ? body.context : "";
  } catch {
    return Response.json({ suggestions: [] });
  }

  if (!context.trim()) {
    return Response.json({ suggestions: [] });
  }

  try {
    const { text } = await generateText({
      model: getLanguageModel(FOLLOWUP_MODEL),
      temperature: 0.7,
      maxOutputTokens: 80,
      prompt: `Based on the conversation below, write 3 short follow-up messages the USER might send next.
Rules:
- First person, as if the user is typing (e.g. "Show me the code", "Make it shorter").
- Max 8 words each. No numbering, no quotes, no trailing punctuation.
- Distinct from each other and relevant to the last assistant reply.
Return ONLY a JSON array of exactly 3 strings.

Conversation:
${context.slice(0, 2500)}`,
    });

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return Response.json({ suggestions: [] });
    }

    const parsed = JSON.parse(match[0]);
    const suggestions = Array.isArray(parsed)
      ? parsed
          .filter(
            (s): s is string => typeof s === "string" && s.trim().length > 0
          )
          .slice(0, 3)
      : [];

    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
