/**
 * SPIKE: can we do true image-to-image editing THROUGH the Vercel AI Gateway
 * (keeping ZDR + the existing key), via Gemini 2.5 Flash Image ("Nano Banana")?
 *
 * 1) generate a source image (gpt-image-1, text→image — known-good).
 * 2) EDIT it: send the source image + an instruction to gemini-2.5-flash-image
 *    via generateText, and check for an IMAGE in result.files (image-out).
 *
 * If step 2 returns an edited image → image-to-image is Gateway-native (clean).
 * Run: pnpm --filter web-v3 exec tsx scripts/image-edit-spike.mts
 */
import { readFileSync } from "node:fs";
import {
  gateway,
  experimental_generateImage as generateImage,
  generateText,
} from "ai";

if (!process.env.AI_GATEWAY_API_KEY) {
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
}

console.log("1) generating source image (gpt-image-1)…");
const { image } = await generateImage({
  model: gateway.imageModel("openai/gpt-image-1"),
  prompt: "a simple flat vector coffee bean logo, brown on cream, centered",
});
const srcBase64 = image.base64;
console.log(`   source image ok (${srcBase64.length} b64 chars)`);

console.log("2) editing via gemini-2.5-flash-image (image-in → image-out)…");
try {
  const result = await generateText({
    model: gateway.languageModel("google/gemini-2.5-flash-image"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Add a subtle warm glow behind this logo. Keep the logo itself identical — only add the glow.",
          },
          { type: "image", image: srcBase64, mediaType: "image/png" },
        ],
      },
    ],
  });
  const files = result.files ?? [];
  const images = files.filter((f) => f.mediaType?.startsWith("image/"));
  console.log(
    `   result.files=${files.length} images=${images.length} text="${(result.text ?? "").slice(0, 80)}"`
  );
  if (images.length > 0) {
    console.log(
      `   edited image mediaType=${images[0].mediaType} bytes≈${images[0].base64?.length ?? 0}`
    );
    console.log(
      "\nRESULT ✅ image-to-image works via the Gateway (Gemini). ZDR-consistent, no new key."
    );
  } else {
    console.log(
      "\nRESULT ⚠️ no image returned — model gave text only. Image-out not available this way."
    );
  }
} catch (e) {
  console.log(`\nRESULT ❌ edit call failed: ${(e as Error).message}`);
}
