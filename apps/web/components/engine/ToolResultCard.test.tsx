/**
 * SPEC 23B-MPP2 — ToolResultCard pay_api dispatch tests.
 *
 * Pinned behavior:
 *   - pay_api result with a known vendor slug routes to the matching MPP
 *     primitive (verified by checking for vendor-specific text/markup).
 *   - pay_api result with an unknown vendor slug falls back to
 *     <GenericMppReceipt> (vendor name uppercased in card chrome).
 *   - pay_api result with completely empty / malformed data degrades
 *     gracefully (no throw, no crash, returns null or empty card).
 *   - tool.status !== 'done' or tool.isError suppresses rendering.
 *   - The pay_api branch fires BEFORE the WRITE_TOOL_NAMES fallback (which
 *     would have rejected the result for missing `tx`).
 *
 * Pre-MPP2 the dispatch returned null for every pay_api call (no `tx` field
 * on ServiceResult → `'tx' in data` rejected it). The tests below pin that
 * behavior is now per-vendor.
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

describe('ToolResultCard — pay_api dispatch (SPEC 23B-MPP2)', () => {
  it('routes Fal-Flux serviceId → CardPreview (image)', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.04',
          serviceId: 'fal/fal-ai/flux/dev',
          result: { images: [{ url: 'https://cdn/x.png', width: 1024, height: 1024 }] },
        })}
      />,
    );
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.textContent).toContain('FAL FLUX');
    expect(container.textContent).toContain('AI-DESIGNED');
  });

  it('routes Suno serviceId → TrackPlayer (audio)', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.05',
          serviceId: 'suno/v1/generate',
          result: { audio_url: 'https://cdn/x.mp3', title: 'Midnight Rain', duration: 134 },
        })}
      />,
    );
    expect(container.querySelector('audio')).not.toBeNull();
    expect(container.textContent).toContain('Midnight Rain');
    expect(container.textContent).toContain('SUNO');
  });

  it('routes PDFShift serviceId → BookCover', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.05',
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

  it('routes Lob serviceId → VendorReceipt', () => {
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

  it('routes Teleflora serviceId → VendorReceipt', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '45.00',
          serviceId: 'teleflora/v1/order',
          result: { description: '12-stem bouquet · Sunday delivery' },
        })}
      />,
    );
    expect(container.textContent).toContain('TELEFLORA');
    expect(container.textContent).toContain('12-stem bouquet');
  });

  it('falls back to GenericMppReceipt for unknown vendors', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: '0xpaymentdigest',
          price: '0.10',
          serviceId: 'newvendor/v1/foo',
          // Legacy fields the GenericMppReceipt fallback knows how to render
          serviceName: 'New Vendor',
          deliveryEstimate: 'instant',
        })}
      />,
    );
    // GenericMppReceipt uppercases vendor and renders deliveryEstimate
    expect(container.textContent).toContain('NEW VENDOR');
    expect(container.textContent).toContain('instant');
  });

  it('renders SuiscanLink when paymentDigest is present (every variant)', () => {
    const { container } = render(
      <ToolResultCard
        tool={payApiTool({
          success: true,
          paymentDigest: 'ABCDEF1234567890ABCDEF1234567890ABCD',
          price: '0.04',
          serviceId: 'fal',
          result: { url: 'https://cdn/x.png' },
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
      result: { success: true }, // no `data` key
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
          price: '0.04',
          serviceId: 'fal',
          result: { url: 'https://cdn/x.png' },
          // Critically: no `tx` field. Pre-MPP2 this rendered null.
        })}
      />,
    );
    // Per-vendor render should have happened
    expect(container.querySelector('img')).not.toBeNull();
  });
});
