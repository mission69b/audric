import { Redis } from '@upstash/redis';

/**
 * [v1.4] Single Upstash client used by every Redis-backed feature
 * (sessions, conversation state, session spend tracking, …).
 *
 * Constructed eagerly at module load so misconfigured env vars surface as a
 * clear error during boot instead of on the first request.
 */
export const redis = Redis.fromEnv();
