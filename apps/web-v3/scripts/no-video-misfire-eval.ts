/**
 * no-video-misfire regression eval (2026-06-26 tool-confusion fix).
 *
 * Locks the invariant: generate_video is exposed ONLY on video-intent turns, so
 * the model can't mis-fire it on an IMAGE turn (the incident: "create a better
 * version of this image" looped into generate_video + the Gateway video quota).
 * Tests the pure gate the route uses to build the active tool set.
 *
 * Run: pnpm --filter @audric/web-v3 eval:no-video-misfire
 */
import { hasVideoIntent } from "../lib/ai/video-intent";

type Case = { label: string; text: string; expect: boolean };

const CASES: Case[] = [
  // --- MUST gate CLOSED (image / non-video turns — the incident class) ---
  {
    label: "image edit (the incident turn)",
    text: "create a better version of this image in a new style",
    expect: false,
  },
  {
    label: "5 image styles (the loop trigger)",
    text: "lets do one of each cyberpunk steampunk art deco watercolor minimalist",
    expect: false,
  },
  {
    label: "plain image gen",
    text: "generate an image of a cat",
    expect: false,
  },
  { label: "upscale", text: "upscale this and make it sharper", expect: false },
  { label: "plain chat", text: "what's the meaning of life?", expect: false },
  {
    label: "research",
    text: "research the AI coding landscape",
    expect: false,
  },
  // --- MUST gate OPEN (real video intent) ---
  {
    label: "explicit video",
    text: "make a video of a calm ocean wave at sunset",
    expect: true,
  },
  { label: "animate", text: "animate this image", expect: true },
  {
    label: "clip",
    text: "create a short clip of a city at night",
    expect: true,
  },
  { label: "bring to life", text: "bring this photo to life", expect: true },
];

let passed = 0;
console.log(`no-video-misfire eval — ${CASES.length} cases\n`);
for (const c of CASES) {
  const got = hasVideoIntent({ text: c.text });
  const ok = got === c.expect;
  if (ok) {
    passed++;
  }
  console.log(
    `${ok ? "✅" : "❌"} exposed=${got} expect=${c.expect}  ${c.label}`
  );
}
console.log(`\n${passed}/${CASES.length} passed`);
if (passed !== CASES.length) {
  console.log("FAIL ❌ — video-misfire invariant broken");
  process.exit(1);
}
console.log("PASS ✅ (generate_video never exposed without video intent)");
