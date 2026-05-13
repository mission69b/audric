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

// ─── SPEC native_content_tools P5 / 2026-05-13 ─────────────────────────
// `compose_pdf` and `compose_image_grid` route to the generic
// <DownloadableArtifact> primitive. These tests assert the dispatch and
// the prop shape; <DownloadableArtifact> visual behavior is exercised
// in its own test file.

describe('ToolResultCard — compose_pdf dispatch (P5)', () => {
  function composePdfTool(payload: unknown): ToolExecution {
    return {
      toolName: 'compose_pdf',
      toolUseId: 'toolu_01ComposePdfTest',
      input: { pages: [] },
      status: 'done',
      result: { success: true, data: payload },
    };
  }

  it('routes a valid compose_pdf result to <DownloadableArtifact> with PDF kind', () => {
    const { container, queryAllByText } = render(
      <ToolResultCard
        tool={composePdfTool({
          url: 'https://blob.vercel-storage.com/audric-test.pdf',
          filename: 'audric-test.pdf',
          pageCount: 3,
          sizeKb: 124,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })}
      />,
    );

    // PDF placeholder (not <img>); the header label + body placeholder
    // both contain "PDF" so assert ≥1 match rather than exactly one.
    expect(container.querySelector('img')).toBeNull();
    expect(queryAllByText('PDF').length).toBeGreaterThanOrEqual(1);
    // Page count + size visible
    expect(container.textContent).toMatch(/3 pages/);
    expect(container.textContent).toMatch(/124 KB/);
    // Download chip
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe(
      'https://blob.vercel-storage.com/audric-test.pdf',
    );
  });

  it('returns null for compose_pdf result missing required fields (defensive)', () => {
    const { container } = render(
      <ToolResultCard
        tool={composePdfTool({ url: 'https://x/a.pdf' /* missing filename + sizeKb */ })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('ToolResultCard — compose_image_grid dispatch (P5)', () => {
  function composeGridTool(payload: unknown): ToolExecution {
    return {
      toolName: 'compose_image_grid',
      toolUseId: 'toolu_01ComposeGridTest',
      input: { images: [] },
      status: 'done',
      result: { success: true, data: payload },
    };
  }

  it('routes a valid compose_image_grid result to <DownloadableArtifact> with image kind', () => {
    const { container, queryByText } = render(
      <ToolResultCard
        tool={composeGridTool({
          url: 'https://blob.vercel-storage.com/grid.webp',
          layout: '2x2',
          width: 1024,
          height: 1024,
          sizeKb: 56,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })}
      />,
    );

    // Image renders inline
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(
      'https://blob.vercel-storage.com/grid.webp',
    );
    // Header label
    expect(queryByText('IMAGE GRID')).not.toBeNull();
    // Dimensions visible
    expect(container.textContent).toMatch(/1024×1024/);
    // OPEN chip (not DOWNLOAD)
    expect(container.textContent).toMatch(/OPEN/);
  });

  it('synthesizes a filename from the layout for display purposes', () => {
    const { container } = render(
      <ToolResultCard
        tool={composeGridTool({
          url: 'https://blob.vercel-storage.com/g.webp',
          layout: '3x3',
          width: 1536,
          height: 1536,
          sizeKb: 200,
        })}
      />,
    );
    expect(container.textContent).toMatch(/audric-grid-3x3\.webp/);
  });

  it('returns null for compose_image_grid result missing required fields', () => {
    const { container } = render(
      <ToolResultCard
        tool={composeGridTool({ width: 512 /* missing url + sizeKb */ })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
