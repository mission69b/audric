// ───────────────────────────────────────────────────────────────────────────
// SPEC 21.1 — applyTransitionStateToLatest unit tests
//
// Pins the pure mutation helper that backs `useEngine.setLatestTransitionState`
// and the engine-emitted `stream_state` event handler.
//
// What's covered:
//   - Updates the LAST assistant message (skips trailing user messages).
//   - Skips non-assistant messages mid-array.
//   - Returns the same array reference when state is unchanged
//     (so React.setState bails out on the no-op).
//   - Returns prev unchanged when no assistant message exists.
//   - Walks `done` → `confirming` → `done` round-trip cleanly.
//   - Empty messages array is handled.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { applyTransitionStateToLatest } from '../transition-state-utils';
import type { EngineChatMessage } from '../engine-types';

function msg(
  role: 'user' | 'assistant',
  id: string,
  transitionState?: EngineChatMessage['transitionState'],
): EngineChatMessage {
  return {
    id,
    role,
    content: '',
    timestamp: 0,
    transitionState,
  };
}

describe('applyTransitionStateToLatest', () => {
  it('updates the LAST assistant message in the array', () => {
    const prev = [msg('user', 'u1'), msg('assistant', 'a1'), msg('assistant', 'a2')];
    const next = applyTransitionStateToLatest(prev, 'routing');

    expect(next).not.toBe(prev);
    expect(next[2].transitionState).toBe('routing');
    expect(next[1].transitionState).toBeUndefined();
  });

  it('walks past trailing user messages to find the latest assistant', () => {
    const prev = [msg('assistant', 'a1'), msg('user', 'u1'), msg('user', 'u2')];
    const next = applyTransitionStateToLatest(prev, 'confirming');
    expect(next[0].transitionState).toBe('confirming');
    expect(next[1].transitionState).toBeUndefined();
    expect(next[2].transitionState).toBeUndefined();
  });

  it('returns prev (referential equality) when state is unchanged', () => {
    const prev = [msg('assistant', 'a1', 'routing')];
    const next = applyTransitionStateToLatest(prev, 'routing');
    // Same reference → React.setState bails out → no re-render.
    expect(next).toBe(prev);
  });

  it('returns prev when there is no assistant message', () => {
    const prev = [msg('user', 'u1'), msg('user', 'u2')];
    const next = applyTransitionStateToLatest(prev, 'done');
    expect(next).toBe(prev);
  });

  it('returns prev for an empty array', () => {
    const prev: EngineChatMessage[] = [];
    const next = applyTransitionStateToLatest(prev, 'routing');
    expect(next).toBe(prev);
    expect(next).toHaveLength(0);
  });

  it('round-trips done → confirming → done cleanly', () => {
    const m = msg('assistant', 'a1', 'done');
    const a = applyTransitionStateToLatest([m], 'confirming');
    expect(a[0].transitionState).toBe('confirming');

    const b = applyTransitionStateToLatest(a, 'done');
    expect(b[0].transitionState).toBe('done');

    const c = applyTransitionStateToLatest(b, 'done');
    // Second 'done' is a no-op → same reference.
    expect(c).toBe(b);
  });

  it('accepts null to clear the state', () => {
    const prev = [msg('assistant', 'a1', 'done')];
    const next = applyTransitionStateToLatest(prev, null);
    expect(next[0].transitionState).toBeNull();
  });

  it('does not mutate the input messages', () => {
    const original = msg('assistant', 'a1');
    const prev = [original];
    applyTransitionStateToLatest(prev, 'routing');
    // Input untouched (immutable update).
    expect(original.transitionState).toBeUndefined();
  });
});
