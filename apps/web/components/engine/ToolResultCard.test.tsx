/**
 * SPEC 23B-MPP2 + SPEC 24 F3 — ToolResultCard pay_api dispatch tests.
 *
 * Pinned behavior:
 *   - pay_api result with a SUPPORTED vendor slug (per locked 5-service
 *     set in SPEC_24_GATEWAY_INVENTORY.md §8) routes to the matching MPP
 *     primitive (verified by checking for vendor-specific text/markup).
 *   - openai is endpoint-aware: DALL-E → CardPreview, Whisper/chat →
 *     VendorReceipt with OpenAI vendor tag.
 *   - pay_api result with a DROPPED vendor (fal, suno, teleflora, etc.)
 *     falls through to <GenericMppReceipt> — system prompt should keep
 *     this rare, but the fall-through path is tested for safety.
 *   - pay_api result with completely empty / malformed data degrades
 *     gracefully (no throw, no crash).
 *   - tool.status !== 'done' or tool.isError suppresses rendering.
 *   - The pay_api branch fires BEFORE the WRITE_TOOL_NAMES fallback.
 *
 * Pre-MPP2 the dispatch returned null for every pay_api call (no `tx` field
 * on ServiceResult → `'tx' in data` rejected it). Post-MPP2 (CARD_RENDERERS)
 * + Post-F3 (locked 5-service set) the dispatch is per-vendor for supported
 * services and graceful-fallback for everything else.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ToolResultCard } from './ToolResultCard';
import type { ToolExecution } from '@/lib/engine-types';

function payApiTool(payload: unknown): ToolExecution {
  return {
    toolName: 'pay_api',
    toolUseId: 'toolu_01PayApiTest',
    input: { url: 'https://mpp.t2000.ai/foo' },
    status: 'done',
    result: { success: true, data: payload },
  };
}

describe('[SPEC 24 F3] ToolResultCard — pay_api dispatch for locked 5-service set', () => {
  describe('openai (endpoint-aware)', () => {
    it('routes openai DALL-E → CardPreview (image surface)', () => {
      const { container } = render(
        <ToolResultCard
          tool={payApiTool({
            success: true,
            paymentDigest: '0xpaymentdigest',
            price: '0.05',
            serviceId: 'openai/v1/images/generations',
            result: { data: [{ url: 'https://cdn/dall-e.png' }], created: 1715000000 },
          })}
        />,
      );
      expect(container.querySelector('img')).not.toBeNull();
    });

    it('routes openai Whisper transcription → VendorReceipt with OpenAI vendor tag', () => {
      const { container } = render(
        <ToolResultCard
          tool={payApiTool({
            success: true,
            paymentDigest: '0xpaymentdigest',
            price: '0.01',
            serviceId: 'openai/v1/audio/transcriptions',
            result: { text: 'Hello world.' },
          })}
        />,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
      expect(container.textContent).toContain('OPENAI');
    });

    it('routes openai GPT-4o chat → VendorReceipt with OpenAI vendor tag', () => {
      const { container } = render(
        <ToolResultCard
          tool={payApiTool({
            success: true,
            paymentDigest: '0xpaymentdigest',
            price: '0.01',
            serviceId: 'openai/v1/chat/completions',
            result: { choices: [{ message: { content: 'A whale is a marine mammal.' } }] },
          })}
        />,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
      expect(container.textContent).toContain('OPENAI');
    });
  });

  it('routes elevenlabs → TrackPlayer (audio)', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.05',
          serviceId: 'elevenlabs/v1/text-to-speech/voiceId',
          result: { audio_url: 'https://cdn/tts.mp3' },
        })}
      />,
    );
    expect(container.querySelector('audio')).not.toBeNull();
  });

  it('routes pdfshift → BookCover', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.01',
          serviceId: 'pdfshift/v1/convert',
          result: {
            url: 'https://cdn/book.pdf',
            page_count: 12,
            format: 'A4',
            title: 'Coloring Book',
          },
        })}
      />,
    );
    expect(container.textContent).toContain('PDFSHIFT');
    expect(container.textContent).toContain('Coloring Book');
    expect(container.textContent).toContain('P1');
  });

  it('routes lob → VendorReceipt with Lob vendor tag', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '1.00',
          serviceId: 'lob/v1/postcards',
          result: {
            description: 'Birthday card · USPS First-Class',
            expected_delivery_date: '2026-04-24',
          },
        })}
      />,
    );
    expect(container.textContent).toContain('LOB');
    expect(container.textContent).toContain('Birthday card');
  });

  it('routes resend → VendorReceipt with Resend vendor tag', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.005',
          serviceId: 'resend/v1/emails',
          result: { id: 'msg_abc123', from: 'a@b.com', to: 'c@d.com' },
        })}
      />,
    );
    expect(container.textContent).toContain('RESEND');
  });
});

describe('[SPEC 24 F3] ToolResultCard — dropped vendors fall through to GenericMppReceipt', () => {
  it('fal (dropped) falls through to GenericMppReceipt', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.04',
          serviceId: 'fal/fal-ai/flux/dev',
          serviceName: 'Fal Flux',
          deliveryEstimate: 'instant',
        })}
      />,
    );
    // GenericMppReceipt path — uses serviceName / deliveryEstimate, NOT
    // the per-vendor chrome that CardPreview would render.
    expect(container.textContent).toContain('FAL FLUX');
    expect(container.textContent).toContain('instant');
  });

  it('suno (Phase 5 only — not in registry today) falls through to GenericMppReceipt', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.05',
          serviceId: 'suno/v1/generate',
          serviceName: 'Suno',
          deliveryEstimate: 'async',
        })}
      />,
    );
    // Generic fallback — no <audio> element (TrackPlayer would have rendered one)
    expect(container.querySelector('audio')).toBeNull();
    expect(container.textContent).toContain('SUNO');
  });

  it('falls back to GenericMppReceipt for unknown vendors', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.10',
          serviceId: 'newvendor/v1/foo',
          serviceName: 'New Vendor',
          deliveryEstimate: 'instant',
        })}
      />,
    );
    expect(container.textContent).toContain('NEW VENDOR');
    expect(container.textContent).toContain('instant');
  });
});

describe('ToolResultCard — pay_api defensive paths (unchanged from MPP2)', () => {
  it('renders SuiscanLink when paymentDigest is present (every supported variant)', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: 'ABCDEF1234567890ABCDEF1234567890ABCD',
          price: '0.05',
          serviceId: 'openai/v1/images/generations',
          result: { data: [{ url: 'https://cdn/x.png' }] },
        })}
      />,
    );
    expect(container.textContent).toContain('Suiscan');
  });

  it('renders nothing when tool.status !== "done"', () => {
    const { container } = render(
      <ToolResultCard
        tool={{ ...payApiTool({}), status: 'running' }}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when tool.isError is true', () => {
    const { container } = render(
      <ToolResultCard
        tool={{ ...payApiTool({}), isError: true }}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('does not throw on completely empty pay_api data', () => {
    expect(() =>
      render(<ToolResultCard tool={payApiTool({})} />),
    ).not.toThrow();
  });

  it('does not throw on undefined data wrapper', () => {
    const tool: ToolExecution = {
      toolName: 'pay_api',
      toolUseId: 'toolu_01',
      input: {},
      status: 'done',
      result: { success: true },
    };
    expect(() => render(<ToolResultCard tool={tool} />)).not.toThrow();
  });

  it('CARD_RENDERERS dispatch fires BEFORE WRITE_TOOL_NAMES fallback', () => {
    // Pre-MPP2: pay_api in WRITE_TOOL_NAMES + no `tx` field → null render.
    // Post-MPP2: pay_api removed from WRITE_TOOL_NAMES + CARD_RENDERERS
    // entry → per-vendor render. This test asserts the dispatch order is
    // CARD_RENDERERS-first by passing a result with NO `tx` field — if
    // dispatch fell through to WRITE_TOOL_NAMES the result would be null.
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xnotat',
          price: '0.05',
          serviceId: 'openai/v1/images/generations',
          result: { data: [{ url: 'https://cdn/x.png' }] },
          // Critically: no `tx` field. Pre-MPP2 this rendered null.
        })}
      />,
    );
    // Per-vendor render should have happened (DALL-E → CardPreview → <img>)
    expect(container.querySelector('img')).not.toBeNull();
  });
});
