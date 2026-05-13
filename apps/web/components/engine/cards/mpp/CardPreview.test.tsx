/**
 * SPEC 23B-MPP1 — CardPreview tests.
 *
 * Pinned behavior:
 *   - Fal-Flux shape ({ images: [...] }) extracts first image
 *   - DALL-E legacy shape ({ data: [...] }) extracts first image
 *   - Single-image shorthand ({ url } or { image_url }) extracts URL
 *   - Missing image → placeholder gradient + "Preview unavailable"
 *   - Vendor label varies by serviceId (FAL FLUX vs DALL-E vs FAL)
 *   - Footer renders dimensions when present, falls back to "AI-generated · 4:5"
 *   - AI-DESIGNED tag always present
 *   - Defensive against malformed result
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CardPreview } from './CardPreview';

describe('CardPreview', () => {
  it('extracts image from Fal-Flux shape (images: [{ url, w, h }])', () => {
    const { container } = render(
      <CardPreview
        data={{
          serviceId: 'fal/fal-ai/flux/dev',
          price: '0.04',
          result: { images: [{ url: 'https://cdn.example/a.png', width: 1024, height: 1280 }] },
        }}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.example/a.png');
    expect(container.textContent).toContain('1024×1280');
  });

  it('extracts image from DALL-E legacy shape (data: [{ url }])', () => {
    const { container } = render(
      <CardPreview
        data={{
          serviceId: 'dalle/v1/generate',
          price: '0.04',
          result: { data: [{ url: 'https://cdn.example/dalle.png' }] },
        }}
      />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example/dalle.png');
  });

  it('extracts image from single-image shorthand ({ url })', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal', price: '0.04', result: { url: 'https://cdn/x.jpg' } }} />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/x.jpg');
  });

  it('extracts image from { image_url } shorthand', () => {
    const { container } = render(
      <CardPreview
        data={{ serviceId: 'fal', price: '0.04', result: { image_url: 'https://cdn/y.jpg' } }}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/y.jpg');
  });

  it('renders placeholder when no image URL extractable', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal', price: '0.04', result: { foo: 'bar' } }} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Preview unavailable');
  });

  it('renders placeholder when result is null/undefined', () => {
    const { container } = render(<CardPreview data={{ serviceId: 'fal', price: '0.04' }} />);
    expect(container.textContent).toContain('Preview unavailable');
  });

  // [SPEC 23B-MPP6 UX polish / 2026-05-12] Vendor + artifact naming.
  // Drops "PREVIEW"/"GENERATED" suffix — these cards ARE the final
  // artifact, not a preview. Pattern: "VENDOR · IMAGE".
  //
  // [2026-05-14] Caption was `'DALL-E · IMAGE'` until the dall-e-* shutdown
  // 2026-05-12 made the brand name wrong. Now `'OPENAI · IMAGE'` —
  // vendor-level (matches the existing `'OPENAI · MPP · FAILED'` failure
  // card pattern), future-proof against further model churn, and the
  // literal "DALL-E" never appears in user-facing chrome again.
  it('uses "OPENAI · IMAGE" caption for openai/v1/images/generations', () => {
    const { container } = render(
      <CardPreview
        data={{
          serviceId: 'openai/v1/images/generations',
          price: '0.05',
          result: { data: [{ url: 'x' }] },
        }}
      />,
    );
    expect(container.textContent).toContain('OPENAI · IMAGE');
    // Hard guard: the literal "DALL-E" must NEVER reappear in this caption.
    expect(container.textContent).not.toMatch(/DALL-E/i);
  });

  it('uses "FAL FLUX · IMAGE" caption for fal/fal-ai/flux/dev serviceId', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal/fal-ai/flux/dev', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('FAL FLUX · IMAGE');
  });

  it('uses "FAL FLUX PRO · IMAGE" caption for flux-pro variant', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal/fal-ai/flux-pro', price: '0.05', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('FAL FLUX PRO · IMAGE');
  });

  it('uses "STABILITY · IMAGE" caption for stability-ai serviceId', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'stability-ai/v1/generate', price: '0.03', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('STABILITY · IMAGE');
  });

  it('uses "FAL · IMAGE" caption for non-flux fal services', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal/other', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('FAL · IMAGE');
  });

  it('uses generic "IMAGE" caption when serviceId is missing (no longer "IMAGE PREVIEW")', () => {
    const { container } = render(<CardPreview data={{ result: { url: 'x' } }} />);
    expect(container.textContent).toContain('IMAGE');
    expect(container.textContent).not.toContain('IMAGE PREVIEW');
  });

  it('renders price in header', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('$0.04');
  });

  it('AI-DESIGNED tag always present', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('AI-DESIGNED');
  });

  it('falls back to "AI-generated · 4:5" footer when dimensions absent', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('AI-generated');
  });

  it('renders SuiscanLink when paymentDigest present', () => {
    const { container } = render(
      <CardPreview
        data={{
          serviceId: 'fal',
          price: '0.04',
          result: { url: 'x' },
          paymentDigest: 'ABCDEF1234567890ABCDEF1234567890ABCD',
        }}
      />,
    );
    expect(container.textContent).toContain('Suiscan');
  });

  it('does not render SuiscanLink when paymentDigest absent', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).not.toContain('Suiscan');
  });
});
