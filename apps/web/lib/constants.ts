// Re-export of validated client-safe NEXT_PUBLIC_* env values. Going
// through `env` (instead of reading `process.env` directly) gets us the
// boot-time schema validation: a missing GOOGLE_CLIENT_ID or invalid
// SUI_NETWORK enum value fails fast at build instead of producing a
// silent `''` that breaks zkLogin in the browser.
import { env } from '@/lib/env';

export const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
export const GOOGLE_CLIENT_ID = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
export const ENOKI_API_KEY = env.NEXT_PUBLIC_ENOKI_API_KEY;
