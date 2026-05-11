/**
 * SPEC 24 — pin STATIC_SYSTEM_PROMPT to the locked 5-service set.
 *
 * Prevents the regression class fixed by porting engine 1.29.1's prompt
 * rewrite into the audric-side STATIC_SYSTEM_PROMPT. The engine's
 * DEFAULT_SYSTEM_PROMPT is never used in production — the audric host
 * always passes its own prompt to QueryEngine — so SPEC 24 F1 + G1/G2/G3
 * had to land in BOTH prompts. This test ensures the audric copy stays
 * in sync (the engine copy is pinned by `packages/engine/src/prompt/index.test.ts`).
 *
 * If you add or rename a supported MPP service, update both this test
 * AND the engine prompt test in lockstep.
 */
import { describe, expect, it } from 'vitest';
import { STATIC_SYSTEM_PROMPT } from '../engine-context';

describe('STATIC_SYSTEM_PROMPT — SPEC 24 locked 5-service set', () => {
  it('declares the locked supported set header', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('## MPP services (pay_api) — locked supported set');
    expect(STATIC_SYSTEM_PROMPT).toContain('5 MPP services');
  });

  it('enumerates exactly the 5 supported services with their costs', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('openai');
    expect(STATIC_SYSTEM_PROMPT).toContain('elevenlabs');
    expect(STATIC_SYSTEM_PROMPT).toContain('pdfshift');
    expect(STATIC_SYSTEM_PROMPT).toContain('lob');
    expect(STATIC_SYSTEM_PROMPT).toContain('resend');
    expect(STATIC_SYSTEM_PROMPT).toContain('DALL-E images $0.05');
    expect(STATIC_SYSTEM_PROMPT).toContain('Whisper transcription $0.01');
    expect(STATIC_SYSTEM_PROMPT).toContain('GPT-4o chat $0.01');
    expect(STATIC_SYSTEM_PROMPT).toContain('postcards $1.00');
    expect(STATIC_SYSTEM_PROMPT).toContain('letters $1.50');
  });

  it('does NOT recommend dropped vendors as quick-ref pay_api targets', () => {
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/pay_api POST https:\/\/mpp\.t2000\.ai\/(deepl|openweather|fal|brave)\//);
  });

  it('postcard flow uses openai DALL-E for the design (not Fal Flux)', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('https://mpp.t2000.ai/openai/v1/images/generations');
    expect(STATIC_SYSTEM_PROMPT).not.toContain('fal/fal-ai/flux/dev');
  });

  it('preserves the two-step preview→mail safety rule for postcards', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('NEVER skip the preview step');
    expect(STATIC_SYSTEM_PROMPT).toContain('NEVER send a physical postcard without showing the design first');
    expect(STATIC_SYSTEM_PROMPT).toContain('Use ISO-3166 country codes');
  });

  it('G1: GPT-4o is gated to explicit user requests; default is native Claude', () => {
    expect(STATIC_SYSTEM_PROMPT).toMatch(/write it natively \(FREE — you are Claude\)/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/EXPLICITLY asks for GPT-4o output/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/Default = native, paid = explicit-request only/);
  });

  it('G2: list-services intent is constrained to the 5 supported services', () => {
    expect(STATIC_SYSTEM_PROMPT).toMatch(/list ONLY the 5 supported services/);
    expect(STATIC_SYSTEM_PROMPT).toMatch(/NEVER enumerate the full mpp_services catalog to the user/);
    expect(STATIC_SYSTEM_PROMPT).toContain('the gateway hosts ~40 services but Audric only supports 5');
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

  it('Tool usage section mentions the 5-service set, not dropped vendors', () => {
    expect(STATIC_SYSTEM_PROMPT).toMatch(/For image generation, transcription, content generation, premium TTS \/ sound effects, HTML→PDF, physical mail, or transactional email, use pay_api/);
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
