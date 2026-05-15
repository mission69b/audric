import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { authenticateRequest, assertOwns, isValidSuiAddress } from '@/lib/auth';
import { env } from '@/lib/env';
import { createOpenAI, type OpenAITranscriptionModelOptions } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe, NoTranscriptGeneratedError } from 'ai';

/**
 * POST /api/voice/transcribe
 *
 * Speech-to-text via OpenAI Whisper through the Vercel AI SDK
 * (`experimental_transcribe` from `ai` + `@ai-sdk/openai`).
 *
 * [SPEC 37 v0.7a Phase 1 — R3 voice transcribe migration, 2026-05-15]
 * Migrated from a hand-rolled multipart fetch against
 * `https://api.openai.com/v1/audio/transcriptions` to the AI SDK's
 * unified transcription surface. Behaviour preserved verbatim:
 *   - Same Whisper model (`whisper-1`)
 *   - Same `prompt` vocabulary biasing (PROMPT_HINTS below — feeds via
 *     `providerOptions.openai.prompt`)
 *   - Same 25s upstream timeout via `abortSignal: AbortSignal.timeout(25_000)`
 *   - Same client contract (multipart/form-data with `audio` + `address`,
 *     returns `{ text: string }`)
 *
 * Sister route `/api/voice/synthesize` (ElevenLabs TTS via the
 * `with-timestamps` endpoint) is intentionally NOT migrated. The AI SDK's
 * `experimental_generateSpeech` returns audio only — no per-character
 * alignment timestamps, which the Claude-style word-highlight UX in
 * `useVoiceMode.ts` depends on. Re-evaluate when AI SDK adds alignment
 * support, or fold into the v0.7c voice UI rebuild.
 *
 * Why server-side: keeps the OPENAI_API_KEY out of the browser. Whisper
 * is also significantly better than the browser's Web Speech API at
 * handling crypto jargon (vSUI, haSUI, NAVI, USDC), accents, and the
 * 98 non-English languages we want to support without engineering effort.
 *
 * Auth + rate limit mirror the engine chat route so abuse is bounded
 * — 60 requests / minute / IP, plus zkLogin JWT verification.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper's hard limit

/**
 * Bias Whisper toward Audric/SUI vocabulary. Whisper's `prompt` parameter
 * is a soft hint applied as the previous-utterance context, NOT a
 * grammar constraint, so this only nudges the spelling for tokens it
 * would otherwise mis-segment ("v sui" → "vSUI").
 */
const PROMPT_HINTS =
  'Audric. SUI. USDC. USDT. vSUI. haSUI. afSUI. NAVI. NAVX. CETUS. SCA. MPP. t2000. Sui blockchain. NAVI Protocol.';

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  // [SPEC 30 Phase 1A.3] Auth FIRST. See voice/synthesize/route.ts for
  // rationale.
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError('Voice mode is not configured on this deployment', 503);
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`voice-stt:${ip}`, 60, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError('Invalid form data', 400);
  }

  const address = formData.get('address');
  if (typeof address !== 'string' || !isValidSuiAddress(address)) {
    return jsonError('Invalid Sui address', 400);
  }

  const ownership = assertOwns(auth.verified, address);
  if (ownership) return ownership;

  const audio = formData.get('audio');
  if (!(audio instanceof Blob)) {
    return jsonError('Missing `audio` field', 400);
  }
  if (audio.size === 0) {
    return jsonError('Empty audio blob', 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError(`Audio too large (max ${MAX_AUDIO_BYTES} bytes)`, 413);
  }

  // The AI SDK's `experimental_transcribe` accepts a Uint8Array directly —
  // it forwards to Whisper as multipart with the right MIME inferred from
  // the model. Browsers send `audio/webm;codecs=opus` from MediaRecorder
  // which Whisper accepts without us having to fake a filename like the
  // pre-migration path did.
  const audioBytes = new Uint8Array(await audio.arrayBuffer());

  const openai = createOpenAI({ apiKey });

  try {
    const result = await transcribe({
      model: openai.transcription('whisper-1'),
      audio: audioBytes,
      providerOptions: {
        openai: {
          prompt: PROMPT_HINTS,
          // Don't constrain language — Whisper auto-detects, supporting
          // users who code-switch between English and other languages
          // mid-sentence.
        } satisfies OpenAITranscriptionModelOptions,
      },
      abortSignal: AbortSignal.timeout(25_000),
    });

    return new Response(JSON.stringify({ text: result.text.trim() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (NoTranscriptGeneratedError.isInstance(err)) {
      console.warn('[voice/transcribe] Whisper produced no transcript', {
        cause: err.cause,
      });
      return jsonError('Transcription failed', 502);
    }
    console.warn('[voice/transcribe] transcribe call failed', err);
    return jsonError('Transcription service unavailable', 502);
  }
}
