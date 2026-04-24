'use client';

import { useEffect, useState } from 'react';

/**
 * Lightweight client probe of /api/voice/status. We use it to decide
 * whether the mic button should appear at all — when the deployment is
 * missing OPENAI_API_KEY or ELEVENLABS_API_KEY, hiding the button is a
 * better UX than showing one that always errors.
 *
 * Cached for the lifetime of the page (the underlying route also sets
 * Cache-Control: max-age=60), so this fires at most once per session
 * even if multiple components subscribe.
 */

interface VoiceStatus {
  enabled: boolean;
  sttEnabled: boolean;
  ttsEnabled: boolean;
}

let cached: VoiceStatus | null = null;
let pending: Promise<VoiceStatus> | null = null;

async function fetchStatus(): Promise<VoiceStatus> {
  if (cached) return cached;
  if (pending) return pending;
  pending = fetch('/api/voice/status', { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : { enabled: false, sttEnabled: false, ttsEnabled: false }))
    .then((data: VoiceStatus) => {
      cached = data;
      pending = null;
      return data;
    })
    .catch(() => {
      const fallback: VoiceStatus = { enabled: false, sttEnabled: false, ttsEnabled: false };
      cached = fallback;
      pending = null;
      return fallback;
    });
  return pending;
}

export function useVoiceStatus(): VoiceStatus {
  const [status, setStatus] = useState<VoiceStatus>(
    cached ?? { enabled: false, sttEnabled: false, ttsEnabled: false },
  );

  useEffect(() => {
    if (cached) return;
    let alive = true;
    void fetchStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  return status;
}
