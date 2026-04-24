import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';

/**
 * POST /api/voice/transcribe
 *
 * Speech-to-text via OpenAI Whisper. Body is multipart/form-data with a
 * single `audio` field containing the recorded audio blob (webm/opus from
 * MediaRecorder, or any format Whisper accepts).
 *
 * Why server-side: keeps the OPENAI_API_KEY out of the browser. Whisper
 * is also significantly better than the browser's Web Speech API at
 * handling crypto jargon (vSUI, haSUI, NAVI, USDC), accents, and the
 * 98 non-English languages we want to support without engineering effort.
 *
 * Auth + rate limit mirror the engine chat route so abuse is bounded
 * — 60 requests / minute / IP, plus zkLogin JWT verification.
 *
 * The route deliberately accepts a `prompt` field so callers can pass
 * domain-specific terms ("USDC, vSUI, haSUI, NAVI, t2000") that bias
 * Whisper toward correct spelling. We seed it with the Audric token
 * registry by default — see PROMPT_HINTS below.
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError('Voice mode is not configured on this deployment', 503);
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`voice-stt:${ip}`, 60, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  // Auth: zkLogin JWT (header) + Sui address (form field). Mirrors the
  // engine chat route convention: JWT lives in `x-zklogin-jwt` header,
  // `address` in the request body. Voice mode is auth-only — we don't
  // expose it to anonymous demo users to keep the abuse surface narrow.
  const jwt = request.headers.get('x-zklogin-jwt');
  if (!jwt) return jsonError('Authentication required', 401);
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

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

  // Re-pack into a Whisper-friendly form submission. Browser MediaRecorder
  // typically emits `audio/webm;codecs=opus` which Whisper accepts.
  const whisperForm = new FormData();
  // Whisper requires a filename to infer the format — without it the
  // upload is rejected with a 400.
  const filename =
    audio.type.includes('mp4') ? 'audio.mp4' :
    audio.type.includes('mpeg') ? 'audio.mp3' :
    audio.type.includes('wav') ? 'audio.wav' :
    'audio.webm';
  whisperForm.append('file', audio, filename);
  whisperForm.append('model', 'whisper-1');
  whisperForm.append('prompt', PROMPT_HINTS);
  whisperForm.append('response_format', 'json');
  // Don't constrain language — Whisper auto-detects, supporting users
  // who code-switch between English and other languages mid-sentence.

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    console.warn('[voice/transcribe] Whisper fetch failed', err);
    return jsonError('Transcription service unavailable', 502);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.warn('[voice/transcribe] Whisper returned non-2xx', {
      status: response.status,
      body: errorText.slice(0, 500),
    });
    return jsonError('Transcription failed', 502);
  }

  const result = (await response.json().catch(() => null)) as
    | { text?: string }
    | null;

  if (!result || typeof result.text !== 'string') {
    return jsonError('Malformed transcription response', 502);
  }

  return new Response(JSON.stringify({ text: result.text.trim() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
