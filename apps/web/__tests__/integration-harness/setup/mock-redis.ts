/**
 * Integration harness — in-memory SessionStore implementation.
 *
 * The chat route calls `getSessionStore()` (from `engine-factory.ts`)
 * which lazily constructs an UpstashSessionStore backed by real Upstash
 * Redis. In the integration harness, we vi.mock the factory to return
 * an instance of this in-memory store instead — same interface, no
 * network, deterministic state.
 *
 * Lifecycle:
 *   - `reset()` clears all state. Call from `beforeEach` so test order
 *     doesn't matter and a failing test doesn't leak state into the next.
 *   - `dump()` returns a snapshot of the entire store. Use this in
 *     test assertions to verify exactly what the chat route persisted.
 *   - `inspect(sessionId)` returns a single session's persisted form,
 *     equivalent to what `scripts/dump-session.ts` reads from real Redis.
 *
 * What this catches that real Redis can't:
 *   - Race conditions are impossible (single-threaded JS event loop +
 *     synchronous Map). For race-condition tests, we'll add scheduled
 *     delays in a future phase.
 *   - TTL behavior is faked (entries never expire). For TTL-related
 *     tests, we'd need to plug a fake clock. Not phase 1.
 */

import type { SessionStore, SessionData } from '@t2000/engine';

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionData>();
  private readonly userIndex = new Map<string, string[]>();

  async get(sessionId: string): Promise<SessionData | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(session: SessionData): Promise<void> {
    // Match UpstashSessionStore semantics: full overwrite. The JSON
    // round-trip ensures the harness sees the same shape the chat
    // route would persist over the wire (no leaked Maps, Sets, or
    // class instances that wouldn't survive serialization).
    const serialized = JSON.parse(JSON.stringify(session)) as SessionData;
    this.sessions.set(serialized.id, serialized);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId);
  }

  async listByUser(address: string, limit = 20): Promise<string[]> {
    const ids = this.userIndex.get(address) ?? [];
    return ids.slice(0, limit);
  }

  async addToUserIndex(address: string, sessionId: string): Promise<void> {
    const existing = this.userIndex.get(address) ?? [];
    // Match UpstashSessionStore's LPUSH + LTRIM(0, 49): newest first,
    // capped at 50. Avoid duplicates so re-saves don't push the same
    // ID twice.
    const filtered = existing.filter((id) => id !== sessionId);
    filtered.unshift(sessionId);
    this.userIndex.set(address, filtered.slice(0, 50));
  }

  // -- Test-only helpers (not part of SessionStore interface) ---------

  /**
   * Clear all state. Always call from `beforeEach` so tests are
   * order-independent.
   */
  reset(): void {
    this.sessions.clear();
    this.userIndex.clear();
  }

  /**
   * Snapshot the entire store. Useful for diffing two harness runs
   * (legacy vs v2) at the persistence layer.
   */
  dump(): { sessions: Record<string, SessionData>; userIndex: Record<string, string[]> } {
    return {
      sessions: Object.fromEntries(this.sessions),
      userIndex: Object.fromEntries(this.userIndex),
    };
  }

  /**
   * Read a single session, equivalent to what `scripts/dump-session.ts`
   * reads from real Redis. Returns `null` when the session doesn't
   * exist (matching `get()`).
   */
  inspect(sessionId: string): SessionData | null {
    return this.sessions.get(sessionId) ?? null;
  }
}

/**
 * Module-singleton instance the harness reuses across tests. Tests
 * call `getInMemorySessionStore().reset()` in `beforeEach` to clear
 * state. Using a singleton (instead of constructing one per test)
 * means the vi.mock of `getSessionStore` can return THIS instance
 * deterministically without per-test wiring.
 */
let singleton: InMemorySessionStore | null = null;

export function getInMemorySessionStore(): InMemorySessionStore {
  if (!singleton) singleton = new InMemorySessionStore();
  return singleton;
}
