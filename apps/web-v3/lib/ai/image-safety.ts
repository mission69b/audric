import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";

// Safety gate for reference-grounded / real-subject image generation
// (SPEC_AUDRIC_IMAGE_PIPELINE §5). "Uncensored" never means illegal: this blocks
// the existential categories on EVERY tier — sexual content of real people,
// anything sexual involving minors, illegal content, and defamatory/political
// deepfakes. Normal portraits, stylizations, and real objects/places are fine.

const CLASSIFIER_MODEL = "deepseek/deepseek-v3.2";

const schema = z.object({
  allowed: z.boolean(),
  reason: z.string().describe("Short reason, shown to the user if blocked."),
});

// Backstop if the classifier call fails: deny the obvious existential terms.
const HARD_DENY =
  /\b(nude|naked|nsfw|sexual|porn|explicit|lingerie|underwear|child|minor|underage|teen)\b/i;

export async function classifyReferenceRequest({
  subject,
  instruction,
}: {
  subject: string;
  instruction: string;
}): Promise<{ allowed: boolean; reason: string }> {
  const text = `Subject: ${subject}\nImage request: ${instruction}`;
  try {
    const { object } = await generateObject({
      model: getLanguageModel(CLASSIFIER_MODEL),
      schema,
      system:
        "You gate image generation of REAL named people/subjects created from a web reference photo. Set allowed=false ONLY if the request is: sexual/nude/intimate content depicting a REAL person; anything sexual involving minors; otherwise illegal content; or a DEFAMATORY/false 'deepfake' that portrays a real person doing something they didn't (e.g. a real person committing a crime, a politician in a fabricated compromising or criminal scene, fake endorsements). ALLOW normal/professional portraits, age/fitness/style edits, artistic stylizations, and any real objects, vehicles, products, landmarks, or places. Be decisive; most requests are allowed.",
      prompt: text,
    });
    return { allowed: object.allowed, reason: object.reason };
  } catch {
    // Fail-closed on obvious existential terms; otherwise allow (the image
    // provider's own safety is the final backstop).
    if (HARD_DENY.test(text)) {
      return {
        allowed: false,
        reason: "this request isn't allowed for an image of a real person",
      };
    }
    return { allowed: true, reason: "" };
  }
}
