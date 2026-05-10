/**
 * SPEC 22.2 — Tests for the SSE heartbeat helper.
 *
 * The helper installs a `setInterval` that periodically pushes `:hb\n\n`
 * (an SSE comment line) onto a `ReadableStream` controller. The
 * comment is ignored by the client SSE parser but keeps bytes flowing
 * so edge-proxy intermediaries don't idle-close the connection during
 * long server-side waits.
 *
 * These tests pin:
 *  - timer is installed on call
 *  - heartbeats fire on the configured interval
 *  - stop() releases the timer (no further heartbeats)
 *  - calling stop() twice is idempotent
 *  - if `controller.enqueue` throws (closed stream), we auto-stop and
 *    don't keep retrying
 *  - the payload is exactly `:hb\n\n` so the client parser ignores it
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSseHeartbeat } from '../sse-heartbeat';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeController(): {
  controller: { enqueue: ReturnType<typeof vi.fn> };
  encoder: TextEncoder;
} {
  return {
    controller: { enqueue: vi.fn() },
    encoder: new TextEncoder(),
  };
}

describe('startSseHeartbeat', () => {
  it('emits the first heartbeat after one full interval (default 5s)', () => {
    const { controller, encoder } = makeController();
    const stop = startSseHeartbeat(controller, encoder);

    // Nothing emitted before the interval tick.
    expect(controller.enqueue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4_999);
    expect(controller.enqueue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(controller.enqueue).toHaveBeenCalledTimes(1);

    stop();
  });

  it('emits the exact `:hb\\n\\n` payload', () => {
    const { controller, encoder } = makeController();
    const stop = startSseHeartbeat(controller, encoder);

    vi.advanceTimersByTime(5_000);

    expect(controller.enqueue).toHaveBeenCalledTimes(1);
    const chunk = controller.enqueue.mock.calls[0][0] as Uint8Array;
    expect(new TextDecoder().decode(chunk)).toBe(':hb\n\n');

    stop();
  });

  it('emits one heartbeat per interval tick', () => {
    const { controller, encoder } = makeController();
    const stop = startSseHeartbeat(controller, encoder);

    vi.advanceTimersByTime(5_000);
    expect(controller.enqueue).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(controller.enqueue).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5_000);
    expect(controller.enqueue).toHaveBeenCalledTimes(3);

    stop();
  });

  it('supports custom interval', () => {
    const { controller, encoder } = makeController();
    const stop = startSseHeartbeat(controller, encoder, 1_000);

    vi.advanceTimersByTime(1_000);
    expect(controller.enqueue).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    expect(controller.enqueue).toHaveBeenCalledTimes(2);

    stop();
  });

  it('stop() prevents further heartbeats', () => {
    const { controller, encoder } = makeController();
    const stop = startSseHeartbeat(controller, encoder);

    vi.advanceTimersByTime(5_000);
    expect(controller.enqueue).toHaveBeenCalledTimes(1);

    stop();
    vi.advanceTimersByTime(60_000);
    expect(controller.enqueue).toHaveBeenCalledTimes(1);
  });

  it('stop() is idempotent (safe to call twice)', () => {
    const { controller, encoder } = makeController();
    const stop = startSseHeartbeat(controller, encoder);

    stop();
    stop();
    stop();

    vi.advanceTimersByTime(60_000);
    expect(controller.enqueue).not.toHaveBeenCalled();
  });

  it('auto-stops if controller.enqueue throws (closed stream)', () => {
    const { encoder } = makeController();
    let throwCount = 0;
    const controller = {
      enqueue: vi.fn().mockImplementation(() => {
        throwCount++;
        throw new Error('controller closed');
      }),
    };
    const stop = startSseHeartbeat(controller, encoder);

    vi.advanceTimersByTime(5_000);
    expect(throwCount).toBe(1);

    // Subsequent ticks must not call enqueue again — auto-stop fired.
    vi.advanceTimersByTime(60_000);
    expect(throwCount).toBe(1);

    stop();
  });

  it('returns a stop function (not undefined)', () => {
    const { controller, encoder } = makeController();
    const stop = startSseHeartbeat(controller, encoder);
    expect(typeof stop).toBe('function');
    stop();
  });
});
