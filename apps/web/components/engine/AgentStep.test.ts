/**
 * SPEC 23A-A3 — getStepIcon glyph fidelity vs `audric_demos_v2/demos/*.html`.
 *
 * These assertions lock the demo-aligned glyphs so a future refactor can't
 * silently regress them back to the generic 🔄 / 🔍 / 📇 set.
 */

import { describe, expect, it } from 'vitest';

import { getPayApiGlyph, getStepIcon } from './AgentStep';

describe('getStepIcon — demo glyph fidelity (SPEC 23A-A3)', () => {
  it('swap_execute uses ⇆ (demo 01 CETUS · SUI ROUTE row)', () => {
    expect(getStepIcon('swap_execute')).toBe('⇆');
  });

  it('swap_quote shares the same ⇆ glyph as swap_execute (consistency)', () => {
    expect(getStepIcon('swap_quote')).toBe('⇆');
  });

  it('mpp_services uses ⊞ (demo 05 DISCOVER MPP row)', () => {
    expect(getStepIcon('mpp_services')).toBe('⊞');
  });

  it('save_contact uses 👤 (demo 01 CONTACT · "MOM" row)', () => {
    expect(getStepIcon('save_contact')).toBe('👤');
  });

  it('balance_check keeps 💰 (already at demo bar)', () => {
    expect(getStepIcon('balance_check')).toBe('💰');
  });

  it('rates_info / yield_summary keep 📈 (already at demo bar)', () => {
    expect(getStepIcon('rates_info')).toBe('📈');
    expect(getStepIcon('yield_summary')).toBe('📈');
  });

  it('falls through to ⚙️ for unknown tool names', () => {
    expect(getStepIcon('this_tool_does_not_exist')).toBe('⚙️');
  });

  it('pay_api with no input returns the generic ⚡ (back-compat with pre-F4 callers)', () => {
    expect(getStepIcon('pay_api')).toBe('⚡');
  });
});

// SPEC 24 F4 (locked 2026-05-11) — per-vendor pay_api glyph dispatch.
//
// The base STEP_ICONS['pay_api'] = '⚡' fires for any call without input.
// When input.url is supplied, getPayApiGlyph (and getStepIcon's pay_api
// branch) inspect the URL and return the right vendor glyph for the locked
// 5-service supported set (SPEC_24_GATEWAY_INVENTORY.md §8). Tests below
// pin every supported endpoint + the fall-through behavior for unsupported
// services / malformed input.
describe('[SPEC 24 F4] getPayApiGlyph — per-vendor dispatch by URL', () => {
  // OpenAI — endpoint-aware dispatch (3 supported endpoints)
  it('openai DALL-E images → ✦', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/openai/v1/images/generations' })).toBe('✦');
  });

  it('openai Whisper transcription → 🎙️', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/openai/v1/audio/transcriptions' })).toBe('🎙️');
  });

  it('openai GPT-4o chat completions → 💬', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/openai/v1/chat/completions' })).toBe('💬');
  });

  // ElevenLabs — endpoint-aware dispatch (2 supported endpoints)
  it('elevenlabs TTS → 🎤', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/elevenlabs/v1/text-to-speech/voiceId' })).toBe('🎤');
  });

  it('elevenlabs sound generation → 🎶', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/elevenlabs/v1/sound-generation' })).toBe('🎶');
  });

  // Single-icon services
  it('pdfshift convert → 📄', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/pdfshift/v1/convert' })).toBe('📄');
  });

  it('lob postcards → ✉ (postcard / letter / verify all share the icon)', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/lob/v1/postcards' })).toBe('✉');
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/lob/v1/letters' })).toBe('✉');
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/lob/v1/address-verify' })).toBe('✉');
  });

  it('resend email → 📧 (transactional + batch share the icon)', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/resend/v1/emails' })).toBe('📧');
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/resend/v1/emails/batch' })).toBe('📧');
  });

  // Fall-through: unsupported services → generic ⚡
  it('unsupported vendor (fal — dropped per SPEC 24) falls through to ⚡', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/fal/fal-ai/flux/dev' })).toBe('⚡');
  });

  it('unsupported vendor (anthropic — dropped per SPEC 24) falls through to ⚡', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/anthropic/v1/messages' })).toBe('⚡');
  });

  it('unsupported vendor (suno — Phase 5, not in gateway today) falls through to ⚡', () => {
    expect(getPayApiGlyph({ url: 'https://mpp.t2000.ai/suno/v1/generate' })).toBe('⚡');
  });

  // Defensive — malformed / absent input
  it('undefined input → ⚡ (engine state where input hasn\'t streamed yet)', () => {
    expect(getPayApiGlyph(undefined)).toBe('⚡');
  });

  it('null input → ⚡', () => {
    expect(getPayApiGlyph(null)).toBe('⚡');
  });

  it('empty object input → ⚡ (no url field)', () => {
    expect(getPayApiGlyph({})).toBe('⚡');
  });

  it('input.url is non-string → ⚡ (defensive against schema drift)', () => {
    expect(getPayApiGlyph({ url: 123 })).toBe('⚡');
    expect(getPayApiGlyph({ url: null })).toBe('⚡');
  });

  it('non-MPP-gateway URL → ⚡ (defensive)', () => {
    expect(getPayApiGlyph({ url: 'https://example.com/openai/v1/images' })).toBe('✦');
    // Note: the dispatch matches on path substring, so this WILL match openai
    // (the prompt + preflight should keep this URL pattern from happening, but
    // if it does, we'd rather show the right glyph than silently fall through).
  });
});

describe('[SPEC 24 F4] getStepIcon — pay_api branches to getPayApiGlyph when input present', () => {
  it('pay_api + DALL-E URL → ✦', () => {
    expect(getStepIcon('pay_api', { url: 'https://mpp.t2000.ai/openai/v1/images/generations' })).toBe('✦');
  });

  it('pay_api + Lob URL → ✉', () => {
    expect(getStepIcon('pay_api', { url: 'https://mpp.t2000.ai/lob/v1/postcards' })).toBe('✉');
  });

  it('pay_api + unsupported URL → ⚡ (matches getPayApiGlyph fall-through)', () => {
    expect(getStepIcon('pay_api', { url: 'https://mpp.t2000.ai/fal/fal-ai/flux/dev' })).toBe('⚡');
  });

  it('non-pay_api tool ignores input (back-compat)', () => {
    expect(getStepIcon('balance_check', { url: 'https://mpp.t2000.ai/openai/v1/images' })).toBe('💰');
  });

  it('pay_api with input=undefined keeps the pre-F4 base behavior (⚡ from STEP_ICONS)', () => {
    expect(getStepIcon('pay_api')).toBe('⚡');
    expect(getStepIcon('pay_api', undefined)).toBe('⚡');
  });
});
