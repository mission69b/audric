/**
 * SPEC 23B-MPP1 — TrackPlayer tests.
 *
 * Pinned behavior:
 *   - Suno shape ({ audio_url, duration, title, image_url? }) extracts cleanly
 *   - Generic shorthand ({ url, duration?, title? }) works
 *   - Missing audio → "Audio unavailable" fallback
 *   - Vendor label varies by serviceId (SUNO vs ELEVENLABS vs AUDIO PREVIEW)
 *   - <audio> element preload="none" + hidden + has the URL
 *   - Duration formats as M:SS (zero-padded seconds)
 *   - Cover image renders when image_url present, gradient placeholder otherwise
 *   - Play button rendered when audio is present
 *   - Defensive against malformed result
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TrackPlayer } from './TrackPlayer';

describe('TrackPlayer', () => {
  it('extracts Suno shape ({ audio_url, duration, title })', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'suno/v1/generate',
          price: '0.05',
          result: {
            audio_url: 'https://cdn/track.mp3',
            duration: 134,
            title: 'Midnight Rain',
          },
        }}
      />,
    );
    expect(container.textContent).toContain('Midnight Rain');
    expect(container.textContent).toContain('SUNO');
    expect(container.textContent).toContain('2:14');
    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe('https://cdn/track.mp3');
    // [SPEC 23B-MPP6 UX polish followup #2 / 2026-05-12] Was 'none'
    // pre-fix; switched to 'metadata' so duration loads eagerly. For
    // data: URIs this is free (audio is already in memory as base64);
    // for http(s) URLs it's a tiny range request. Without this the
    // seekbar reads "0:00 / 0:00" until the user clicks Play, which
    // founder smoke surfaced as "audio card renders but won't play".
    expect(audio?.getAttribute('preload')).toBe('metadata');
  });

  it('extracts generic shorthand ({ url, duration, title })', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'unknown',
          price: '0.05',
          result: { url: 'https://cdn/x.mp3', duration: 60, title: 'Generic' },
        }}
      />,
    );
    expect(container.textContent).toContain('Generic');
    expect(container.textContent).toContain('1:00');
  });

  it('renders ElevenLabs label for elevenlabs serviceId', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'elevenlabs/v1/text-to-speech',
          price: '0.05',
          result: { audio_url: 'https://cdn/tts.mp3' },
        }}
      />,
    );
    expect(container.textContent).toContain('ELEVENLABS');
  });

  it('renders cover image when image_url present', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'suno',
          price: '0.05',
          result: {
            audio_url: 'https://cdn/x.mp3',
            image_url: 'https://cdn/cover.jpg',
            title: 'Foo',
          },
        }}
      />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn/cover.jpg');
    expect(img?.getAttribute('alt')).toBe('Cover');
  });

  it('renders gradient placeholder when no cover image', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'suno',
          price: '0.05',
          result: { audio_url: 'https://cdn/x.mp3', title: 'Lo-fi Beat' },
        }}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    // Title appears inside the placeholder + once in the title row
    expect(container.textContent).toContain('Lo-fi Beat');
  });

  it('falls back to "Audio unavailable" when no URL extractable', () => {
    const { container } = render(
      <TrackPlayer data={{ serviceId: 'suno', price: '0.05', result: { foo: 'bar' } }} />,
    );
    expect(container.textContent).toContain('Audio unavailable');
    expect(container.querySelector('audio')).toBeNull();
  });

  it('falls back when result is null', () => {
    const { container } = render(<TrackPlayer data={{ serviceId: 'suno', price: '0.05' }} />);
    expect(container.textContent).toContain('Audio unavailable');
  });

  it('formats duration as 0:00 when missing/invalid', () => {
    const { container } = render(
      <TrackPlayer data={{ serviceId: 'suno', price: '0.05', result: { audio_url: 'x' } }} />,
    );
    expect(container.textContent).toContain('0:00');
  });

  it('zero-pads seconds (M:SS not M:S)', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'suno',
          price: '0.05',
          result: { audio_url: 'https://cdn/x.mp3', duration: 65 },
        }}
      />,
    );
    expect(container.textContent).toContain('1:05');
    expect(container.textContent).not.toContain('1:5'); // not unpadded
  });

  it('renders Play button (svg path) when audio is present', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'suno',
          price: '0.05',
          result: { audio_url: 'https://cdn/x.mp3', duration: 30 },
        }}
      />,
    );
    expect(container.querySelector('button[aria-label="Play"]')).not.toBeNull();
  });

  it('falls back to "Generated Audio" title when none provided', () => {
    const { container } = render(
      <TrackPlayer
        data={{ serviceId: 'suno', price: '0.05', result: { audio_url: 'https://cdn/x.mp3' } }}
      />,
    );
    expect(container.textContent).toContain('Generated Audio');
  });

  it('renders SuiscanLink when paymentDigest present', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'suno',
          price: '0.05',
          result: { audio_url: 'https://cdn/x.mp3' },
          paymentDigest: 'ABCDEF1234567890ABCDEF1234567890ABCD',
        }}
      />,
    );
    expect(container.textContent).toContain('Suiscan');
  });

  it('does not render SuiscanLink when paymentDigest absent', () => {
    const { container } = render(
      <TrackPlayer data={{ serviceId: 'suno', price: '0.05', result: { audio_url: 'https://cdn/x.mp3' } }} />,
    );
    expect(container.textContent).not.toContain('Suiscan');
  });

  it('extracts audio from { type: "audio", dataUri } shape (OpenAI TTS via /api/services/complete)', () => {
    const { container } = render(
      <TrackPlayer
        data={{
          serviceId: 'openai/v1/audio/speech',
          price: '0.02',
          result: {
            type: 'audio',
            dataUri: 'data:audio/mpeg;base64,SUQzAwAAAAAA',
          },
        }}
      />,
    );
    const audioEl = container.querySelector('audio');
    expect(audioEl).not.toBeNull();
    expect(audioEl?.getAttribute('src')).toContain('data:audio/mpeg;base64,');
    expect(container.textContent).not.toContain('Audio unavailable');
  });
});
