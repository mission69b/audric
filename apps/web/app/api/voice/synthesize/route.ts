import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { authenticateRequest, assertOwns, isValidSuiAddress } from '@/lib/auth';
import { env } from '@/lib/env';

/**
 * POST /api/voice/synthesize
 *
 * Text-to-speech via ElevenLabs `with-timestamps` endpoint. Returns the
 * generated audio (base64-encoded MP3) plus per-character timing info so
 * the UI can highlight words as they're spoken — the same Claude-style
 * "lighter color = not yet spoken" UX shown in the user's reference shots.
 *
 * Why ElevenLabs over OpenAI TTS: OpenAI's tts-1 endpoint doesn't expose
 * word/character timestamps, so the highlight feature would require us to
 * fake timing via character-rate estimation, which looks janky on long
 * sentences. ElevenLabs returns exact start times for every character.
 *
 * Why we return base64 instead of streaming the audio: simplifies the
 * client (one fetch → one Blob → one HTMLAudioElement), and the response
 * is already small enough (~30KB per sentence) that streaming overhead
 * isn't worth it for our use case. If TTS becomes a perf bottleneck for
 * long responses, the route can be upgraded to SSE without changing the
 * client contract.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_TEXT_LEN = 5000;
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel — warm, US English, multilingual model

interface ElevenLabsTimestamps {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  // Multi-language audio also includes `normalized_alignment` but we
  // only need the raw alignment for highlight purposes.
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  // [SPEC 30 Phase 1A.3] Auth FIRST — verify JWT signature AND bind
  // body.address to the verified JWT identity. Pre-Phase-1A an attacker
  // could spoof body.address to bill voice quota against a victim.
  // Auth runs before the env / rate-limit checks so anonymous callers
  // can't probe deployment configuration ("voice not configured" 503
  // vs "rate limited" 429 used to be a tiny info leak).
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return jsonError('Voice mode is not configured on this deployment', 503);
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`voice-tts:${ip}`, 60, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  let body: { text?: unknown; address?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (typeof body.address !== 'string' || !isValidSuiAddress(body.address)) {
    return jsonError('Invalid Sui address', 400);
  }

  const ownership = assertOwns(auth.verified, body.address);
  if (ownership) return ownership;

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return jsonError('`text` is required', 400);
  if (text.length > MAX_TEXT_LEN) {
    return jsonError(`Text too long (max ${MAX_TEXT_LEN} chars)`, 413);
  }

  const voiceId = env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;

  let response: Response;
  try {
    // mp3_44100_64 = 44.1 kHz / 64 kbps. Significantly clearer than the
    // 22.05 kHz / 32 kbps default at ~2x the bytes (~60 KB / sentence).
    // Voice mode is opt-in and ElevenLabs free tier covers ~10k chars,
    // so the bandwidth bump is negligible relative to the UX win.
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_64`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          // eleven_turbo_v2_5: ~300ms latency, 32 languages, the right
          // balance for chat. Use eleven_multilingual_v2 for premium
          // quality on long-form content if cost stops being a concern.
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );
  } catch (err) {
    console.warn('[voice/synthesize] ElevenLabs fetch failed', err);
    return jsonError('Synthesis service unavailable', 502);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.warn('[voice/synthesize] ElevenLabs returned non-2xx', {
      status: response.status,
      body: errorText.slice(0, 500),
    });
    return jsonError('Synthesis failed', 502);
  }

  const result = (await response.json().catch(() => null)) as
    | ElevenLabsTimestamps
    | null;

  if (
    !result ||
    typeof result.audio_base64 !== 'string' ||
    !result.alignment ||
    !Array.isArray(result.alignment.characters)
  ) {
    return jsonError('Malformed synthesis response', 502);
  }

  // Forward only the fields the client needs. Skipping the
  // `normalized_alignment` keeps payloads ~30% smaller for long text.
  return new Response(
    JSON.stringify({
      audioBase64: result.audio_base64,
      alignment: {
        characters: result.alignment.characters,
        startTimes: result.alignment.character_start_times_seconds,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
