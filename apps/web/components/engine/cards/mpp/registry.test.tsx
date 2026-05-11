/**
 * SPEC 23B-MPP1 + SPEC 24 F3 — registry dispatch + slug normalisation tests.
 *
 * Pinned behavior:
 *   - normaliseServiceSlug strips gateway prefix + leading slash
 *   - first path segment + lowercased = slug
 *   - undefined / empty / non-string defensively → ""
 *   - renderMppService routes the locked 5-service set to the right primitive
 *   - openai is endpoint-aware: DALL-E → CardPreview, Whisper/chat → VendorReceipt
 *   - dropped vendors (fal, anthropic, suno, dalle, dall-e, teleflora,
 *     cakeboss, amazon, walmart, party-city, openweather) fall through to
 *     GenericMppReceipt
 *   - GenericMppReceipt fallback never throws
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { normaliseServiceSlug, renderMppService } from './registry';

describe('normaliseServiceSlug', () => {
  it('returns lowercase first path segment for plain slug', () => {
    expect(normaliseServiceSlug('openai/v1/images/generations')).toBe('openai');
    expect(normaliseServiceSlug('elevenlabs/v1/text-to-speech/eleven_monolingual_v1')).toBe(
      'elevenlabs',
    );
    expect(normaliseServiceSlug('lob/v1/postcards')).toBe('lob');
    expect(normaliseServiceSlug('pdfshift/v1/convert')).toBe('pdfshift');
    expect(normaliseServiceSlug('resend/v1/emails')).toBe('resend');
  });

  it('strips https:// gateway prefix', () => {
    expect(normaliseServiceSlug('https://mpp.t2000.ai/openai/v1/images/generations')).toBe('openai');
    expect(normaliseServiceSlug('https://mpp.t2000.ai/lob/v1/postcards')).toBe('lob');
  });

  it('strips http:// gateway prefix', () => {
    expect(normaliseServiceSlug('http://mpp.t2000.ai/elevenlabs/v1/text-to-speech')).toBe('elevenlabs');
  });

  it('tolerates leading slash', () => {
    expect(normaliseServiceSlug('/openai/v1/chat/completions')).toBe('openai');
    expect(normaliseServiceSlug('//lob/v1/postcards')).toBe('lob');
  });

  it('lower-cases mixed-case slugs', () => {
    expect(normaliseServiceSlug('OpenAI/v1/images')).toBe('openai');
    expect(normaliseServiceSlug('LOB/v1/postcards')).toBe('lob');
  });

  it('returns "" for empty / null / undefined', () => {
    expect(normaliseServiceSlug('')).toBe('');
    expect(normaliseServiceSlug(undefined)).toBe('');
    expect(normaliseServiceSlug(null)).toBe('');
  });

  it('returns the whole string for single-segment slugs (no slash)', () => {
    expect(normaliseServiceSlug('walrus')).toBe('walrus');
    expect(normaliseServiceSlug('PDFSHIFT')).toBe('pdfshift');
  });
});

describe('[SPEC 24 F3] renderMppService — locked 5-service supported set', () => {
  describe('openai (endpoint-aware: DALL-E / Whisper / GPT-4o)', () => {
    it('DALL-E images → CardPreview (renders an image surface)', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'openai/v1/images/generations',
            price: '0.05',
            result: {
              data: [{ url: 'https://example.com/dall-e.png' }],
              created: 1715000000,
            },
          })}
        </>,
      );
      // DALL-E should render a CardPreview with an <img> element
      expect(container.querySelector('img')).not.toBeNull();
    });

    it('Whisper transcription → VendorReceipt with OpenAI vendor tag', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'openai/v1/audio/transcriptions',
            price: '0.01',
            result: { text: 'Hello world, this is a test.' },
          })}
        </>,
      );
      // Should render a VendorReceipt (not CardPreview / TrackPlayer / BookCover)
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
      expect(container.textContent).toContain('OPENAI');
    });

    it('GPT-4o chat → VendorReceipt with OpenAI vendor tag', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'openai/v1/chat/completions',
            price: '0.01',
            result: { choices: [{ message: { content: 'A whale is a marine mammal.' } }] },
          })}
        </>,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
      expect(container.textContent).toContain('OPENAI');
    });

    it('openai with missing serviceId still routes via the openai key (defensive)', () => {
      const { container } = render(
        <>
          {renderMppService({
            // No explicit serviceId → falls into renderOpenai's "whisper/chat" branch
            // because the empty string doesn't include /v1/images/generations
            serviceId: 'openai',
            price: '0.01',
          })}
        </>,
      );
      expect(container.textContent).toContain('OPENAI');
    });
  });

  describe('elevenlabs → TrackPlayer', () => {
    it('TTS → renders an audio element', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'elevenlabs/v1/text-to-speech/voiceId',
            price: '0.05',
            result: { audio_url: 'https://example.com/tts.mp3' },
          })}
        </>,
      );
      expect(container.querySelector('audio')).not.toBeNull();
    });

    it('sound-generation → TrackPlayer', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'elevenlabs/v1/sound-generation',
            price: '0.05',
            result: { audio_url: 'https://example.com/sfx.mp3' },
          })}
        </>,
      );
      expect(container.querySelector('audio')).not.toBeNull();
    });
  });

  describe('pdfshift → BookCover', () => {
    it('renders book cover with page thumbnails', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'pdfshift/v1/convert',
            price: '0.01',
            result: {
              url: 'https://example.com/book.pdf',
              page_count: 24,
              format: 'A4',
              title: 'Whale Coloring Book',
            },
          })}
        </>,
      );
      expect(container.textContent).toContain('Whale Coloring Book');
      expect(container.textContent).toContain('PDFSHIFT');
      expect(container.textContent).toContain('P1');
    });
  });

  describe('lob → VendorReceipt (Lob)', () => {
    it('postcard renders Lob vendor tag', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'lob/v1/postcards',
            price: '1.00',
            result: {
              description: 'Birthday card · USPS First-Class',
              expected_delivery_date: '2026-04-24',
            },
          })}
        </>,
      );
      expect(container.textContent).toContain('LOB');
    });

    it('letter renders Lob vendor tag', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'lob/v1/letters',
            price: '1.50',
            result: { description: 'Letter to test address' },
          })}
        </>,
      );
      expect(container.textContent).toContain('LOB');
    });

    it('address-verify renders Lob vendor tag', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'lob/v1/address-verify',
            price: '0.01',
            result: { deliverability: 'deliverable' },
          })}
        </>,
      );
      expect(container.textContent).toContain('LOB');
    });
  });

  describe('resend → VendorReceipt (Resend)', () => {
    it('transactional email renders Resend vendor tag', () => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: 'resend/v1/emails',
            price: '0.005',
            result: { id: 'msg_abc123', from: 'a@b.com', to: 'c@d.com' },
          })}
        </>,
      );
      expect(container.textContent).toContain('RESEND');
    });
  });
});

describe('[SPEC 24 F3] renderMppService — dropped vendors fall through to GenericMppReceipt', () => {
  // These tests pin that the SPEC 24 cleanup fully removed the dropped
  // vendors. If someone re-introduces a renderer for any of these without
  // also updating the locked set in SPEC_24_GATEWAY_INVENTORY.md §8, these
  // tests fail and surface the drift.
  const droppedVendors = [
    { slug: 'fal', service: 'fal/fal-ai/flux/dev' },
    { slug: 'anthropic', service: 'anthropic/v1/messages' },
    { slug: 'dalle', service: 'dalle/v1/generate' }, // misnamed alias (real slug is openai)
    { slug: 'dall-e', service: 'dall-e/v1/generate' },
    { slug: 'suno', service: 'suno/v1/generate' }, // Phase 5 only — joins via add-back recipe
    { slug: 'teleflora', service: 'teleflora/v1/order' },
    { slug: 'cakeboss', service: 'cakeboss/v1/order' },
    { slug: 'amazon', service: 'amazon/v1/order' },
    { slug: 'walmart', service: 'walmart/v1/order' },
    { slug: 'party-city', service: 'party-city/v1/order' },
    { slug: 'openweather', service: 'openweather/v1/weather' },
    { slug: 'gemini', service: 'gemini/v1/chat' },
    { slug: 'fireworks', service: 'fireworks/v1/chat' },
  ];

  it.each(droppedVendors)(
    '$slug falls through to GenericMppReceipt (catch-all path)',
    ({ service }) => {
      const { container } = render(
        <>
          {renderMppService({
            serviceId: service,
            price: '0.01',
            serviceName: 'Dropped Vendor',
            deliveryEstimate: 'n/a',
          })}
        </>,
      );
      // GenericMppReceipt renders the legacy serviceName field uppercased
      expect(container.textContent).toContain('DROPPED VENDOR');
    },
  );
});

describe('[SPEC 24 F3] GenericMppReceipt — defensive fall-through', () => {
  it('falls back to GenericMppReceipt for completely unknown vendors', () => {
    const { container } = render(
      <>
        {renderMppService({
          serviceId: 'someunknownvendor/v1/foo',
          price: '0.10',
          serviceName: 'Unknown Vendor',
          deliveryEstimate: 'instant',
        })}
      </>,
    );
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
