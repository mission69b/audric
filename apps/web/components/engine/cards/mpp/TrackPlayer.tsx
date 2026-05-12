'use client';

/**
 * SPEC 23B-MPP1 — TrackPlayer primitive.
 *
 * Renders the output of an audio-generation MPP service (Suno music gen,
 * ElevenLabs TTS, etc.). Mirrors demo `03-make-a-beat.html`'s
 * `<TrackPlayer>`: dark gradient surface → square cover art (96px) +
 * title/subtitle/play button + waveform/seekbar.
 *
 * Defensive audio extraction:
 *   Suno:        { audio_url, duration, title, image_url? }
 *   ElevenLabs:  { audio_url } or raw bytes (only URL form supported here)
 *   Generic:     { url, duration?, title? }
 *
 * The native `<audio>` element handles play/pause/seek — no custom JS
 * audio engine. Cover art falls back to a synthesized purple gradient
 * with the title overlaid (matches the demo placeholder for tracks
 * without explicit cover art).
 *
 * No autoplay (UX hostile + browser-blocked anyway). User taps to play.
 */

import { useState, useRef, useEffect } from 'react';
import { MppCardShell, MppHeader, fmtMppPrice } from './chrome';
import type { PayApiResult } from './registry';

interface ExtractedAudio {
  url: string;
  duration?: number; // seconds
  title?: string;
  coverUrl?: string;
}

function extractAudio(result: unknown): ExtractedAudio | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  // Suno-shape: { audio_url, duration, title, image_url? }
  if (typeof r.audio_url === 'string') {
    return {
      url: r.audio_url,
      duration: typeof r.duration === 'number' ? r.duration : undefined,
      title: typeof r.title === 'string' ? r.title : undefined,
      coverUrl: typeof r.image_url === 'string' ? r.image_url : undefined,
    };
  }

  // Generic shorthand: { url, duration?, title? }
  if (typeof r.url === 'string') {
    return {
      url: r.url,
      duration: typeof r.duration === 'number' ? r.duration : undefined,
      title: typeof r.title === 'string' ? r.title : undefined,
    };
  }

  // [SPEC 23B-MPP6 UX polish followup / 2026-05-12] Audric's
  // /api/services/complete route converts binary audio responses
  // (OpenAI TTS, ElevenLabs raw bytes) to a base64 data URI:
  //   { type: 'audio', dataUri: 'data:audio/mpeg;base64,...' }
  // The native <audio> element accepts data: URIs directly, so we
  // surface it through the same `url` field as the http(s) cases.
  // Pre-fix this branch missed → renderOpenai fell back to
  // VendorReceipt with no audio player AND the LLM hallucinated
  // "the audio file is embedded above" while the user had nothing
  // to play. See HANDOFF Bug 1.
  if (r.type === 'audio' && typeof r.dataUri === 'string') {
    return {
      url: r.dataUri,
      duration: typeof r.duration === 'number' ? r.duration : undefined,
      title: typeof r.title === 'string' ? r.title : undefined,
    };
  }

  return null;
}

// [SPEC 23B-MPP6 UX polish / 2026-05-12] Vendor + artifact naming.
// Drops "PREVIEW" — this card IS the final audio artifact, not a preview.
// Pairs with `CardPreview.vendorLabel` to keep the naming convention
// consistent across image/audio/music/video surfaces.
function vendorLabel(serviceId: string | undefined): string {
  if (!serviceId) return 'AUDIO';
  const lc = serviceId.toLowerCase();
  if (lc.startsWith('suno')) return 'SUNO · MUSIC';
  if (lc.startsWith('elevenlabs')) return 'ELEVENLABS · AUDIO';
  if (lc.includes('openai') && (lc.includes('audio') || lc.includes('speech'))) return 'OPENAI · AUDIO';
  return 'AUDIO';
}

function fmtDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TrackPlayer({ data }: { data: PayApiResult }) {
  const audio = extractAudio(data.result);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync the play/pause state with the actual <audio> element so external
  // events (track ends, browser cancels playback, user uses media keys)
  // don't desync the visual state.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onTime = () => setCurrentTime(el.currentTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTime);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTime);
    };
  }, []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play().catch(() => setPlaying(false));
  };

  return (
    <MppCardShell
      bodyNoPadding
      className="border-0"
      txDigest={data.paymentDigest}
      header={
        <MppHeader caption={vendorLabel(data.serviceId)} right={fmtMppPrice(data.price)} />
      }
    >
      <div
        className="flex gap-4 items-center p-4"
        style={{
          background: 'linear-gradient(135deg, #0a0a0a, #222)',
          color: '#fff',
        }}
      >
        {/* Cover art — synthesized gradient placeholder (matches demo's "no cover" state) */}
        <div
          className="rounded-md flex-shrink-0 relative overflow-hidden"
          style={{
            width: 88,
            height: 88,
            background: audio?.coverUrl
              ? undefined
              : 'radial-gradient(circle at 30% 30%, #583AEE, #19133A 60%, #000)',
          }}
        >
          {audio?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- vendor URL, not optimisable
            <img src={audio.coverUrl} alt="Cover" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div
              className="absolute inset-0 grid place-items-center text-white text-[10px] font-serif text-center px-2 leading-tight"
              aria-hidden="true"
            >
              {audio?.title?.slice(0, 30) ?? 'Track'}
            </div>
          )}
        </div>

        {/* Title + controls column */}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/60">
            PREVIEW · IN-CHAT
          </div>
          <div className="font-serif text-lg mt-1 truncate">
            {audio?.title ?? 'Generated Audio'}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/50 mt-0.5">
            {fmtDuration(audio?.duration)} · {vendorLabel(data.serviceId).split(' · ')[0]}
          </div>

          {audio?.url ? (
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={togglePlay}
                className="rounded-full grid place-items-center"
                style={{ width: 32, height: 32, background: '#fff', color: '#000' }}
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="2.5" y="2" width="2.5" height="8" rx="0.5" />
                    <rect x="7" y="2" width="2.5" height="8" rx="0.5" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M3 1.5L10 6L3 10.5V1.5Z" />
                  </svg>
                )}
              </button>
              <div
                className="flex-1 rounded-full overflow-hidden"
                style={{ height: 3, background: 'rgba(255,255,255,0.18)' }}
              >
                <div
                  className="h-full rounded-full bg-white transition-all"
                  style={{
                    width: audio.duration && audio.duration > 0
                      ? `${Math.min((currentTime / audio.duration) * 100, 100)}%`
                      : '0%',
                  }}
                />
              </div>
              <div className="font-mono text-[10px] text-white/70 tabular-nums">
                {fmtDuration(currentTime)} / {fmtDuration(audio.duration)}
              </div>
              {/*
                Hidden native audio element — drives the play/pause + timeupdate
                events that sync the visual state above. preload="none" keeps
                bandwidth down until the user actually taps play.
              */}
              <audio ref={audioRef} src={audio.url} preload="none" className="hidden" />
            </div>
          ) : (
            <div className="font-mono text-[10px] text-white/50 mt-3">Audio unavailable</div>
          )}
        </div>
      </div>
    </MppCardShell>
  );
}
