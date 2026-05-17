// ---------------------------------------------------------------------------
// lib/engine/live-stream-clobber-detection.test.ts — S.152 polish
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { detectLiveStreamIdClobber } from './live-stream-clobber-detection';

describe('detectLiveStreamIdClobber', () => {
  it('does NOT warn when the prior slot is empty (null)', () => {
    expect(detectLiveStreamIdClobber(null, 'streamA', 'sess1')).toEqual({
      shouldWarn: false,
    });
  });

  it('does NOT warn when the prior slot is the empty string (defensive)', () => {
    // sessionStorage.getItem returns null for missing keys, but defensively
    // an empty string should also be treated as "no prior value".
    expect(detectLiveStreamIdClobber('', 'streamA', 'sess1')).toEqual({
      shouldWarn: false,
    });
  });

  it('does NOT warn when re-writing the same value (idempotent)', () => {
    expect(detectLiveStreamIdClobber('streamA', 'streamA', 'sess1')).toEqual({
      shouldWarn: false,
    });
  });

  it('WARNS when overwriting a different non-empty value', () => {
    const result = detectLiveStreamIdClobber('streamA', 'streamB', 'sess1');
    expect(result.shouldWarn).toBe(true);
    expect(result.reason).toContain('LIVE_STREAM_ID_CLOBBER');
    expect(result.reason).toContain('session=sess1');
    expect(result.reason).toContain('previous=streamA');
    expect(result.reason).toContain('new=streamB');
  });

  it('warning message format is greppable in Vercel logs', () => {
    const result = detectLiveStreamIdClobber('streamA', 'streamB', 'sess-xyz');
    // The tag `[useEngine] LIVE_STREAM_ID_CLOBBER` should be the prefix so
    // Vercel log search can pivot on it without false positives from other
    // useEngine logs.
    expect(result.reason).toMatch(
      /^\[useEngine\] LIVE_STREAM_ID_CLOBBER /,
    );
  });
});
