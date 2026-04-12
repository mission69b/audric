import { Redis } from '@upstash/redis';
import type { ConversationState, ConversationStateStore } from '@t2000/engine';

const DEFAULT_TTL_SEC = 24 * 60 * 60;

export class UpstashConversationStateStore implements ConversationStateStore {
  private readonly redis: Redis;
  private readonly key: string;
  private readonly ttlSec: number;

  constructor(sessionId: string, opts?: { redis?: Redis; ttlSec?: number }) {
    this.redis = opts?.redis ?? Redis.fromEnv();
    this.key = `conv_state:${sessionId}`;
    this.ttlSec = opts?.ttlSec ?? DEFAULT_TTL_SEC;
  }

  async get(): Promise<ConversationState> {
    const data = await this.redis.get<ConversationState>(this.key);
    return data ?? { type: 'idle' };
  }

  async set(state: ConversationState): Promise<void> {
    await this.redis.set(this.key, state, { ex: this.ttlSec });
  }

  async transition(to: ConversationState): Promise<void> {
    await this.set(to);
  }

  async reset(): Promise<void> {
    await this.redis.del(this.key);
  }
}
