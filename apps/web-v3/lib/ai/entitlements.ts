import type { UserType } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerHour: number;
};

// Per-hour message cap (authed users only; anon is IP-rate-limited separately).
// These are the FREE-tier acquisition caps. Phase 5 makes them tier-based —
// Free keeps a sane cap, Pro/Max lift it (§4b: "effectively unlimited on Pro").
// The template default (10/hr) was far too low (blocked normal use + testing).
export const entitlementsByUserType: Record<UserType, Entitlements> = {
  guest: {
    maxMessagesPerHour: 30,
  },
  regular: {
    maxMessagesPerHour: 100,
  },
};
