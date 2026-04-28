/**
 * GET /api/voice/status
 *
 * Reports whether voice mode is configured on this deployment. The
 * client uses this on mount to decide whether to render the mic button
 * at all — hiding it cleanly when keys are missing avoids the UX of
 * a button that always errors.
 *
 * Public endpoint by design: returns no secrets, only booleans.
 */
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET() {
  return new Response(
    JSON.stringify({
      enabled: !!env.OPENAI_API_KEY && !!env.ELEVENLABS_API_KEY,
      sttEnabled: !!env.OPENAI_API_KEY,
      ttsEnabled: !!env.ELEVENLABS_API_KEY,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
}
