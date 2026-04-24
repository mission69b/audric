'use client';

/**
 * Silence detector built on top of the Web Audio API. Used by the voice
 * mode loop to auto-submit a recorded utterance once the user has stopped
 * speaking for `silenceMs` milliseconds.
 *
 * Why a custom VAD instead of MediaRecorder's `onstop` event:
 * MediaRecorder doesn't natively detect silence — it emits chunks at a
 * fixed cadence. SpeechRecognition's end-of-speech event is unreliable
 * across browsers (Chrome on Android fires it after 8s of silence,
 * Safari sometimes never fires it). An RMS-volume threshold sampled at
 * 100ms gives us bulletproof, cross-browser pause detection that we can
 * tune for the conversational feel we want.
 *
 * The detector exposes one method, `attach(stream)`, which returns a
 * disposer plus a `start()` function. The caller is responsible for
 * calling `start()` once the user has actually begun speaking — we don't
 * fire the silence callback during the initial "warm-up" before any
 * voice has been detected, otherwise an empty room would auto-submit
 * within 1.5s of opening voice mode.
 */

interface SilenceDetectorOptions {
  /** Silence duration before firing (ms). Claude/OpenAI use ~1500ms. */
  silenceMs: number;
  /** RMS volume below this is considered silence. 0.01 ≈ quiet room. */
  silenceThreshold: number;
  /** Fired once silence has persisted for `silenceMs`. */
  onSilence: () => void;
  /** Fired whenever a sample exceeds the threshold (used to gate `start`). */
  onSpeech?: () => void;
}

export interface SilenceDetectorHandle {
  /** Begin watching for silence. Call once after the user starts speaking. */
  start: () => void;
  /** Tear down the audio graph. Idempotent. */
  dispose: () => void;
}

export function attachSilenceDetector(
  stream: MediaStream,
  opts: SilenceDetectorOptions,
): SilenceDetectorHandle {
  const AudioCtx =
    typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : null;
  if (!AudioCtx) {
    return {
      start: () => {
        // No Web Audio support — fall back to a fixed 8s timeout so the
        // recorder still terminates instead of running forever.
        setTimeout(opts.onSilence, 8000);
      },
      dispose: () => {},
    };
  }

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);

  const buf = new Uint8Array(analyser.fftSize);

  let started = false;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let hasDetectedSpeech = false;

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function poll() {
    if (disposed) return;
    analyser.getByteTimeDomainData(buf);

    // Compute RMS deviation from the silence center (128). A perfectly
    // silent channel sits at 128; speech swings ±50 typical. Normalising
    // to [0, 1] gives us the same threshold semantics across mic gains.
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);

    if (rms > opts.silenceThreshold) {
      if (!hasDetectedSpeech) {
        hasDetectedSpeech = true;
        opts.onSpeech?.();
      }
      clearSilenceTimer();
    } else if (started && hasDetectedSpeech && !silenceTimer) {
      silenceTimer = setTimeout(() => {
        if (!disposed) opts.onSilence();
      }, opts.silenceMs);
    }
  }

  pollHandle = setInterval(poll, 100);

  return {
    start: () => {
      started = true;
    },
    dispose: () => {
      disposed = true;
      if (pollHandle) clearInterval(pollHandle);
      clearSilenceTimer();
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        // ignore
      }
      ctx.close().catch(() => {});
    },
  };
}
