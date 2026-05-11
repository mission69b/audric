/**
 * SPEC 23B-MPP1 — registry dispatch + slug normalisation tests.
 *
 * Pinned behavior:
 *   - normaliseServiceSlug strips gateway prefix + leading slash
 *   - first path segment + lowercased = slug
 *   - undefined / empty / non-string defensively → ""
 *   - renderMppService routes known vendors to the right primitive
 *   - unknown vendors fall back to GenericMppReceipt (not null, not throw)
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { normaliseServiceSlug, renderMppService } from './registry';

describe('normaliseServiceSlug', () => {
  it('returns lowercase first path segment for plain slug', () => {
    expect(normaliseServiceSlug('fal/fal-ai/flux/dev')).toBe('fal');
    expect(normaliseServiceSlug('elevenlabs/v1/text-to-speech/eleven_monolingual_v1')).toBe(
      'elevenlabs',
    );
    expect(normaliseServiceSlug('lob/v1/postcards')).toBe('lob');
    expect(normaliseServiceSlug('openweather/v1/weather')).toBe('openweather');
  });

  it('strips https:// gateway prefix', () => {
    expect(normaliseServiceSlug('https://mpp.t2000.ai/fal/fal-ai/flux/dev')).toBe('fal');
    expect(normaliseServiceSlug('https://mpp.t2000.ai/lob/v1/postcards')).toBe('lob');
  });

  it('strips http:// gateway prefix', () => {
    expect(normaliseServiceSlug('http://mpp.t2000.ai/fal/fal-ai/flux/dev')).toBe('fal');
  });

  it('tolerates leading slash', () => {
    expect(normaliseServiceSlug('/fal/fal-ai/flux/dev')).toBe('fal');
    expect(normaliseServiceSlug('//lob/v1/postcards')).toBe('lob');
  });

  it('lower-cases mixed-case slugs', () => {
    expect(normaliseServiceSlug('Fal/Fal-AI/Flux/Dev')).toBe('fal');
    expect(normaliseServiceSlug('LOB/v1/postcards')).toBe('lob');
  });

  it('returns "" for empty / null / undefined', () => {
    expect(normaliseServiceSlug('')).toBe('');
    expect(normaliseServiceSlug(undefined)).toBe('');
    expect(normaliseServiceSlug(null)).toBe('');
  });

  it('returns the whole string for single-segment slugs (no slash)', () => {
    expect(normaliseServiceSlug('walrus')).toBe('walrus');
    expect(normaliseServiceSlug('SUNO')).toBe('suno');
  });
});

describe('renderMppService dispatch', () => {
  it('routes "fal" → CardPreview (renders an image surface)', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'fal/fal-ai/flux/dev',
          price: '0.04',
          result: { images: [{ url: 'https://example.com/img.png', width: 1024, height: 1024 }] },
        })}
      </>,
    );
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.textContent).toContain('FAL FLUX');
  });

  it('routes "dalle" alias → CardPreview', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'dalle/v1/generate',
          price: '0.04',
          result: { url: 'https://example.com/img.png' },
        })}
      </>,
    );
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('routes "suno" → TrackPlayer (renders an audio element)', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'suno/v1/generate',
          price: '0.05',
          result: { audio_url: 'https://example.com/track.mp3', title: 'Midnight Rain', duration: 134 },
        })}
      </>,
    );
    expect(container.querySelector('audio')).not.toBeNull();
    expect(container.textContent).toContain('Midnight Rain');
  });

  it('routes "elevenlabs" → TrackPlayer', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'elevenlabs/v1/text-to-speech',
          price: '0.05',
          result: { audio_url: 'https://example.com/tts.mp3' },
        })}
      </>,
    );
    expect(container.querySelector('audio')).not.toBeNull();
  });

  it('routes "pdfshift" → BookCover (renders page thumbnails)', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'pdfshift/v1/convert',
          price: '0.05',
          result: { url: 'https://example.com/book.pdf', page_count: 24, format: 'A4', title: 'Unicorn Coloring Book' },
        })}
      </>,
    );
    expect(container.textContent).toContain('Unicorn Coloring Book');
    expect(container.textContent).toContain('PDFSHIFT');
    expect(container.textContent).toContain('P1');
  });

  it('routes "lob" → VendorReceipt (Lob)', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'lob/v1/postcards',
          price: '1.00',
          result: { description: 'Birthday card · USPS First-Class', expected_delivery_date: '2026-04-24' },
        })}
      </>,
    );
    expect(container.textContent).toContain('LOB');
  });

  it('routes "teleflora" → VendorReceipt (Teleflora)', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'teleflora/v1/order',
          price: '45.00',
          result: { description: '12-stem bouquet · Sunday delivery' },
        })}
      </>,
    );
    expect(container.textContent).toContain('TELEFLORA');
    expect(container.textContent).toContain('12-stem bouquet');
  });

  it('falls back to GenericMppReceipt for unknown vendors', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'unknownvendor/v1/foo',
          price: '0.10',
          serviceName: 'Unknown Vendor',
          deliveryEstimate: 'instant',
        })}
      </>,
    );
    // Title bar uppercase
    expect(container.textContent).toContain('UNKNOWN VENDOR');
    expect(container.textContent).toContain('instant');
  });

  it('falls back to GenericMppReceipt when serviceId is missing entirely', () => {
    const { container } = render(
      <>
        {renderMppService({
          price: '0.10',
          serviceName: 'Anonymous',
        })}
      </>,
    );
    expect(container.textContent).toContain('ANONYMOUS');
  });

  it('never throws on completely empty input', () => {
    expect(() => render(<>{renderMppService({})}</>)).not.toThrow();
  });
});
