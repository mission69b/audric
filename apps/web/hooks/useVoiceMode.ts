'use client';

/**
 * useVoiceMode — Claude-style continuous voice conversation loop.
 *
 * State machine:
 *
 *   idle → listening → thinking → speaking → listening → ...
 *                ↑                                 │
 *                └─────────────────────────────────┘
 *
 * - `idle`:      voice mode is off (mic button not pressed)
 * - `listening`: mic is open, recording audio, waiting for user to stop
 *                speaking. Silence detector auto-transitions to `thinking`
 *                once 1.5s of silence follows the first detected speech.
 * - `thinking`:  audio uploaded to Whisper, transcript sent to engine,
 *                waiting for the assistant's full text response. The
 *                placeholder shows "Thinking..." in the input bar.
 * - `speaking`:  assistant text in hand, ElevenLabs synthesised audio is
 *                playing. Word-by-word highlight progresses via rAF.
 *                When audio ends → auto-resume `listening`.
 *
 * `stop()` returns to `idle` from any state, aborting in-flight fetches,
 * mic streams, and audio playback.
 *
 * The hook is intentionally engine-agnostic: it accepts callbacks for
 * "submit transcript" and "wait for assistant reply" so the consumer
 * (dashboard-content.tsx) bridges it to useEngine.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { attachSilenceDetector, type SilenceDetectorHandle } from './useSilenceDetector';
import { buildWordSpans, indexAtTime, type WordSpan } from '@/lib/voice/word-alignment';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export interface UseVoiceModeOptions {
  address: string | null;
  jwt: string | undefined;
  /** Submit the transcribed text to the engine. */
  submitTranscript: (text: string) => Promise<void>;
  /**
   * Resolve when the assistant has finished generating its reply. The
   * resolved value is the assistant's text, which we'll synthesise to
   * speech. Returning an empty string skips TTS gracefully.
   */
  awaitAssistantReply: () => Promise<string>;
}

export interface UseVoiceMode {
  state: VoiceState;
  /** Live interim transcript (Whisper doesn't stream — this is empty until we have the final). */
  interimTranscript: string;
  /**
   * Words spoken so far during TTS playback. UI highlights word indices
   * <= spokenWordIndex. -1 means TTS hasn't reached the first word yet.
   */
  spokenWordIndex: number;
  /** All word spans for the message currently being spoken. */
  currentSpans: WordSpan[] | null;
  /** Begin the voice conversation loop. Triggers the mic permission prompt on first use. */
  start: () => Promise<void>;
  /** Exit voice mode entirely. Aborts everything. */
  stop: () => void;
  /** Last user-facing error (e.g. "Microphone access denied"). null when fine. */
  errorMessage: string | null;
  /** True when voice mode is active in any form (not idle). */
  isActive: boolean;
}

const SILENCE_MS = 1500;
const SILENCE_THRESHOLD = 0.015;
const MAX_RECORDING_MS = 30_000; // hard cap so a stuck mic doesn't run forever

export function useVoiceMode(opts: UseVoiceModeOptions): UseVoiceMode {
  const [state, setState] = useState<VoiceState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [spokenWordIndex, setSpokenWordIndex] = useState(-1);
  const [currentSpans, setCurrentSpans] = useState<WordSpan[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stateRef = useRef<VoiceState>('idle');
  stateRef.current = state;

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const detectorRef = useRef<SilenceDetectorHandle | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persist the latest opts.* refs so the recording lifecycle (which is
  // anchored to the MediaRecorder's event listeners, not React renders)
  // always sees fresh callbacks without us having to re-subscribe.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Forward-declared so the three lifecycle callbacks (speak,
  // transcribeAndThink, beginListening) can call each other without
  // forming a circular useCallback dependency. Assigned at the bottom
  // of the hook once all three are defined.
  const beginListeningRef = useRef<() => Promise<void>>(async () => {});

  // ─── teardown ──────────────────────────────────────────────────────
  const teardownMic = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    detectorRef.current?.dispose();
    detectorRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const teardownAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // ignore
      }
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
  }, []);

  const teardownAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    teardownMic();
    teardownAudio();
  }, [teardownMic, teardownAudio]);

  // ─── stop (public) ────────────────────────────────────────────────
  const stop = useCallback(() => {
    teardownAll();
    setState('idle');
    setInterimTranscript('');
    setSpokenWordIndex(-1);
    setCurrentSpans(null);
  }, [teardownAll]);

  // ─── speak (TTS) ──────────────────────────────────────────────────
  const speak = useCallback(
    async (text: string) => {
      if (!text.trim() || stateRef.current === 'idle') return;

      const ac = new AbortController();
      abortRef.current = ac;

      let response: Response;
      try {
        response = await fetch('/api/voice/synthesize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(optsRef.current.jwt
              ? { 'x-zklogin-jwt': optsRef.current.jwt }
              : {}),
          },
          body: JSON.stringify({
            text,
            address: optsRef.current.address,
          }),
          signal: ac.signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setErrorMessage('Could not synthesise speech');
        setState('error');
        return;
      }

      if (!response.ok) {
        setErrorMessage('Synthesis failed');
        setState('error');
        return;
      }

      const payload = (await response.json()) as {
        audioBase64: string;
        alignment: { characters: string[]; startTimes: number[] };
      };

      // Don't start playback if the user pressed Stop while we were waiting.
      // TS narrows stateRef.current via the surrounding setState calls but
      // it's actually mutable from outside (stop() can flip it any time),
      // so we cast through string for the comparison.
      if ((stateRef.current as string) === 'idle') return;

      const spans = buildWordSpans(
        payload.alignment.characters,
        payload.alignment.startTimes,
      );
      setCurrentSpans(spans);
      setSpokenWordIndex(-1);

      const binary = atob(payload.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      audioObjectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      const tick = () => {
        if (!audioRef.current || audioRef.current.paused) return;
        const idx = indexAtTime(spans, audioRef.current.currentTime);
        setSpokenWordIndex((prev) => (idx === prev ? prev : idx));
        rafRef.current = requestAnimationFrame(tick);
      };

      audio.addEventListener('play', () => {
        rafRef.current = requestAnimationFrame(tick);
      });

      audio.addEventListener('ended', () => {
        // Highlight the final word so the UI doesn't visually "leave one
        // behind" when audio stops mid-word due to rAF rounding.
        if (spans.length > 0) setSpokenWordIndex(spans.length - 1);

        // Loop continues: auto-resume listening for the next user turn.
        // Small delay so the highlight settles before the placeholder
        // flips back to "Listening...".
        setTimeout(() => {
          if (stateRef.current === 'speaking') {
            void beginListeningRef.current();
          }
        }, 150);
      });

      setState('speaking');
      try {
        await audio.play();
      } catch (err) {
        // Autoplay policies can block playback in rare cases (e.g.
        // browser was backgrounded). Treat as recoverable: end the
        // speak phase early and resume listening.
        console.warn('[voice] audio.play() rejected', err);
        if (stateRef.current === 'speaking') {
          void beginListeningRef.current();
        }
      }
    },
    [], // deliberate: relies on refs
  );

  // ─── transcribe + thinking ────────────────────────────────────────
  const transcribeAndThink = useCallback(
    async (audioBlob: Blob) => {
      setState('thinking');

      const ac = new AbortController();
      abortRef.current = ac;

      const fd = new FormData();
      fd.append('audio', audioBlob, 'utterance.webm');
      if (optsRef.current.address) fd.append('address', optsRef.current.address);

      let sttResp: Response;
      try {
        sttResp = await fetch('/api/voice/transcribe', {
          method: 'POST',
          headers: optsRef.current.jwt
            ? { 'x-zklogin-jwt': optsRef.current.jwt }
            : {},
          body: fd,
          signal: ac.signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setErrorMessage('Could not reach transcription service');
        setState('error');
        return;
      }

      if (!sttResp.ok) {
        setErrorMessage('Transcription failed');
        setState('error');
        return;
      }

      const { text } = (await sttResp.json()) as { text: string };

      if (!text || stateRef.current === 'idle') return;

      // Empty/very short transcripts (mic noise) — silently resume listening.
      if (text.length < 2) {
        void beginListeningRef.current();
        return;
      }

      setInterimTranscript(text);

      try {
        await optsRef.current.submitTranscript(text);
        const reply = await optsRef.current.awaitAssistantReply();
        if ((stateRef.current as string) === 'idle') return;
        setInterimTranscript('');
        if (reply.trim().length === 0) {
          // No reply text (rare — usually means the engine rendered a
          // card with no narration). Resume listening immediately.
          void beginListeningRef.current();
          return;
        }
        await speak(reply);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[voice] engine reply failed', err);
        setErrorMessage('Audric had trouble responding');
        setState('error');
      }
    },
    [speak],
  );

  // ─── listening ────────────────────────────────────────────────────
  const beginListening = useCallback(async () => {
    teardownMic();
    teardownAudio();
    setInterimTranscript('');
    setCurrentSpans(null);
    setSpokenWordIndex(-1);
    setErrorMessage(null);
    setState('listening');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg =
        (err as DOMException).name === 'NotAllowedError'
          ? 'Microphone access denied'
          : 'Could not open microphone';
      setErrorMessage(msg);
      setState('error');
      return;
    }
    streamRef.current = stream;

    // Pick a MIME the recorder supports. Safari needs `audio/mp4`,
    // Chrome/Firefox prefer `audio/webm;codecs=opus`.
    const mimeCandidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      '',
    ];
    const mimeType = mimeCandidates.find((m) =>
      m === '' ? true : MediaRecorder.isTypeSupported(m),
    );

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      console.warn('[voice] MediaRecorder construction failed', err);
      setErrorMessage('Recording is not supported in this browser');
      setState('error');
      teardownMic();
      return;
    }
    recorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });
    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      teardownMic();
      if (stateRef.current !== 'listening') return;
      if (blob.size < 500) {
        // Effectively empty — likely the user clicked Stop or detector
        // misfired. Resume listening rather than send a useless blob.
        void beginListeningRef.current();
        return;
      }
      void transcribeAndThink(blob);
    });

    detectorRef.current = attachSilenceDetector(stream, {
      silenceMs: SILENCE_MS,
      silenceThreshold: SILENCE_THRESHOLD,
      onSpeech: () => {
        // Update placeholder hint once we know the user is actually talking.
        setInterimTranscript('…');
      },
      onSilence: () => {
        if (stateRef.current === 'listening' && recorderRef.current) {
          try {
            recorderRef.current.requestData?.();
            recorderRef.current.stop();
          } catch {
            // ignore
          }
        }
      },
    });
    detectorRef.current.start();

    // Hard cap on a single utterance so a stuck mic doesn't run away.
    recordingTimeoutRef.current = setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    }, MAX_RECORDING_MS);

    recorder.start(250); // 250ms chunks keep latency bounded
  }, [teardownMic, teardownAudio, transcribeAndThink]);

  // Keep the forward-declared ref pointed at the latest beginListening
  // so the speak/transcribe lifecycle (which captures it once) always
  // re-enters the freshest closure when the loop continues.
  beginListeningRef.current = beginListening;

  // ─── start (public) ───────────────────────────────────────────────
  const start = useCallback(async () => {
    if (stateRef.current !== 'idle' && stateRef.current !== 'error') return;
    await beginListeningRef.current();
  }, []);

  // ─── ESC to exit voice mode ───────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stateRef.current !== 'idle') stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stop]);

  // ─── cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      teardownAll();
    };
  }, [teardownAll]);

  return {
    state,
    interimTranscript,
    spokenWordIndex,
    currentSpans,
    start,
    stop,
    errorMessage,
    isActive: state !== 'idle' && state !== 'error',
  };
}
