/**
 * SPEC 24 (originally) — pin STATIC_SYSTEM_PROMPT to the supported MPP set.
 *
 * 2026-05-12 update (SPEC 23B-MPP6 UX polish followup #2): the supported
 * set was reduced from 5 vendors {openai, elevenlabs, pdfshift, lob,
 * resend} to OpenAI-only at founder direct request. ElevenLabs was
 * broken at the gateway and the simplified vendor list keeps the LLM
 * from offering services that aren't reliably available.
 *
 * PDF / postcard / email come back later via dedicated tools (see
 * `spec_native_content_tools`), at which point those tests should be
 * re-added with the new tool names — NOT by re-adding gateway vendors
 * to the allow-list.
 *
 * If you add an MPP vendor to the allow-list, update both this test
 * AND `lib/engine/mpp-services-tool.ts:SUPPORTED_SERVICE_IDS` in
 * lockstep.
 */
import { describe, expect, it } from 'vitest';
import { STATIC_SYSTEM_PROMPT } from '../engine-context';

describe('STATIC_SYSTEM_PROMPT — OpenAI-only locked set (post UX polish #2)', () => {
  it('declares the locked supported set header (OpenAI only)', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('## MPP services (pay_api) — locked supported set');
    expect(STATIC_SYSTEM_PROMPT).toMatch(/Audric supports exactly 1 MPP vendor: OpenAI/);
  });

  it('enumerates exactly the 4 OpenAI endpoints with their costs', () => {
    // 2026-05-14 (initial): line was `DALL-E images $0.05` until the
    // dall-e-* shutdown 2026-05-12. Renamed to `image generation
    // (gpt-image-1) $0.05` for clarity.
    // 2026-05-14 (B3.6 budget fix): tightened to `images $0.05` because
    // the more verbose form pushed STATIC_SYSTEM_PROMPT past the 10_700
    // token ceiling (10714 vs 10700 — see the budget gate test below).
    // The `gpt-image-1` model name is still in pay_api's tool description
    // (engine v1.30.2), the discover-services card (mpp_services tool),
    // and the model-guidance paragraph in pay.ts — so the LLM has 3 other
    // surfaces telling it which model to call. Saving 24 chars on the
    // pricing line buys us back the budget headroom without losing info.
    expect(STATIC_SYSTEM_PROMPT).toContain('openai');
    expect(STATIC_SYSTEM_PROMPT).toContain('images $0.05');
    expect(STATIC_SYSTEM_PROMPT).toContain('Whisper transcription $0.01');
    expect(STATIC_SYSTEM_PROMPT).toContain('GPT-4o chat $0.01');
    expect(STATIC_SYSTEM_PROMPT).toContain('TTS $0.02');
  });

  it('does NOT mention DALL-E anywhere in STATIC_SYSTEM_PROMPT (post-shutdown brand cleanup)', () => {
    // [2026-05-14] DALL-E was shut down 2026-05-12; gpt-image-1 is the only
    // valid image model. The LLM was narrating "Image generation via DALL-E
    // is $0.05" to users because the prompt taught it that brand. Hard
    // assertion: the prompt must not mention DALL-E in any case.
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/DALL-E|DALLE|dall-e|dalle/i);
  });

  it('does NOT recommend removed vendors as pay_api targets', () => {
    // The decline list ("What we CANNOT do") may name a vendor as the
    // REASON for declining (e.g. "premium TTS via ElevenLabs") so the
    // LLM can explain *why* a request is unsupported. What's banned:
    // recommending those vendors as actual pay_api endpoints, or
    // listing them in the supported-set section.
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/pay_api POST https:\/\/mpp\.t2000\.ai\/(elevenlabs|pdfshift|lob|resend)\//);
    const supportedSection = STATIC_SYSTEM_PROMPT
      .split('## MPP services (pay_api) — locked supported set')[1]
      ?.split('What we CANNOT do')[0] ?? '';
    expect(supportedSection).not.toMatch(/\belevenlabs\b/i);
    expect(supportedSection).not.toMatch(/\bpdfshift\b/i);
    expect(supportedSection).not.toMatch(/\bresend\b/i);
    // The bare vendor name "lob" appears as a substring in "lobal";
    // assert against the URL slug pattern instead.
    expect(supportedSection).not.toMatch(/mpp\.t2000\.ai\/lob\//);
  });

  it('does NOT recommend other dropped vendors as quick-ref pay_api targets', () => {
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/pay_api POST https:\/\/mpp\.t2000\.ai\/(deepl|openweather|fal|brave)\//);
  });

  it('declines postcards / email / premium TTS as "cannot do today"', () => {
    // [SPEC native_content_tools P6 / 2026-05-13] PDF generation was
    // promoted out of "cannot do" — compose_pdf now covers it natively.
    // The remaining declines are the unrelated MPP gaps (Lob/Resend/
    // ElevenLabs not wired) and the explicit narrow case "HTML→PDF
    // with custom CSS" (which would still need a chromium renderer).
    const cannotSection = STATIC_SYSTEM_PROMPT.split('What we CANNOT do')[1]
      ?.split('What Audric CAN do natively')[0] ?? '';
    expect(cannotSection).not.toMatch(/^.*\bPDF generation\b/m);
    expect(cannotSection).toMatch(/postcards\/letters/i);
    expect(cannotSection).toMatch(/transactional email/i);
    expect(cannotSection).toMatch(/premium TTS via ElevenLabs/i);
    // The narrow exception that survives the promotion.
    expect(cannotSection).toMatch(/HTML→PDF rendering with custom CSS/);
  });

  it('points users to dedicated tools for postcard / email path (PDF promoted out)', () => {
    // Pre-P6: "PDF / postcard / email come back as dedicated tools".
    // Post-P6: PDF is now compose_pdf — only postcard / email are still
    // "future release". Assertion narrows to the surviving copy.
    expect(STATIC_SYSTEM_PROMPT).toMatch(/Postcard \/ email come back as dedicated tools/i);
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/PDF \/ postcard \/ email come back as dedicated tools/i);
  });

  it('teaches compose_pdf + compose_image_grid as native-and-free options (P6)', () => {
    // Tool usage section: explicit guidance that compose_* runs first.
    expect(STATIC_SYSTEM_PROMPT).toMatch(/compose_pdf/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/compose_image_grid/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/FREE, server-side, native — always preferred over gateway transforms/);

    // Native-abilities section: both tools listed as audric-can-do.
    expect(STATIC_SYSTEM_PROMPT).toMatch(/PDF composition \(compose_pdf\)/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/image-grid composition \(compose_image_grid\)/);
  });

  it('G1: GPT-4o is gated to explicit user requests; default is native Claude', () => {
    expect(STATIC_SYSTEM_PROMPT).toMatch(/write it natively \(FREE — you are Claude\)/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/EXPLICITLY asks for GPT-4o output/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/Default = native, paid = explicit-request only/);
  });

  it('G2: list-services intent is constrained to the 4 OpenAI endpoints', () => {
    expect(STATIC_SYSTEM_PROMPT).toMatch(/list ONLY OpenAI's 4 endpoints/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/NEVER enumerate the full mpp_services catalog to the user/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/Audric only supports OpenAI today/);
  });

  it('G3: translation and summarization classified as native abilities, not unsupported', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('What Audric CAN do natively');
    expect(STATIC_SYSTEM_PROMPT).toContain('Translation between languages');
    expect(STATIC_SYSTEM_PROMPT).toContain("Summarization, research-as-explain, comparing concepts, drafting copy, math, coding help");
  });

  it('G3: declines list correctly excludes natively-capable tasks', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('What we CANNOT do');
    const cannotSection = STATIC_SYSTEM_PROMPT.split('What we CANNOT do')[1]?.split('What Audric CAN do natively')[0] ?? '';
    expect(cannotSection).not.toMatch(/^- Translation/m);
    expect(cannotSection).not.toMatch(/^- Summarization/m);
  });

  it('does NOT use the pre-SPEC-24 "40+ APIs" framing', () => {
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/40\+\s+real-world APIs/i);
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/40\+\s+paid APIs/i);
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/MPP services\s+\(40\+/i);
  });

  it('Tool usage section mentions the OpenAI-only catalog, not dropped vendors', () => {
    // 2026-05-14: removed the "(DALL-E)" parenthetical from the image-gen
    // bullet. Same intent — teach the LLM that pay_api covers image / audio
    // / content / TTS — without leaking the retired DALL-E brand name.
    expect(STATIC_SYSTEM_PROMPT).toMatch(/For image generation, audio transcription \(Whisper\), content generation \(GPT-4o, on explicit ask only\), or text-to-speech \(OpenAI TTS\), use pay_api/);
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/For weather, translation, image gen, postcards, email, and other real-world services/);
  });

  it('web_search guidance reflects no pay_api search vendor', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('pay_api has no search vendor');
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/Only use pay_api for search if web_search is unavailable/);
  });

  it('mpp_services discovery rules teach _refine recovery', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('_refine payload');
    expect(STATIC_SYSTEM_PROMPT).toContain('validCategories');
    expect(STATIC_SYSTEM_PROMPT).toContain("Don't give up after one filtered miss");
  });
});
