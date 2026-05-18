// [v0.7c Day 1c] Re-import the `UserType` enum from the audric-auth
// stub. Surface preserved for the message-budget read in
// `app/(chat)/api/chat/route.ts` — Phase 2 may re-tier guest vs.
// regular when audric's demo / unauth path is wired.
import type { AudricUserType } from "@/lib/audric-auth";

type Entitlements = {
  maxMessagesPerHour: number;
};

export const entitlementsByUserType: Record<AudricUserType, Entitlements> = {
  guest: {
    maxMessagesPerHour: 10,
  },
  regular: {
    maxMessagesPerHour: 10,
  },
};
