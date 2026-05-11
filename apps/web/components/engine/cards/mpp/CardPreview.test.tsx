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

  it('uses "FAL FLUX · GENERATED" caption for fal/flux/* serviceId', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal/fal-ai/flux/dev', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('FAL FLUX');
  });

  it('uses "DALL-E · GENERATED" caption when serviceId contains "dall"', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'dalle/v1/generate', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('DALL-E');
  });

  it('uses "FAL · GENERATED" caption for non-flux fal services', () => {
    const { container } = render(
      <CardPreview data={{ serviceId: 'fal/other', price: '0.04', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('FAL · GENERATED');
  });

  it('uses generic caption when serviceId is missing', () => {
    const { container } = render(<CardPreview data={{ result: { url: 'x' } }} />);
    expect(container.textContent).toContain('IMAGE PREVIEW');
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
});
