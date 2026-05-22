-- Wave C.7 — Copilot onboarding: track when the email-add nudge was dismissed
-- so we don't re-pop it after the user explicitly closed it (or after they
-- added a verified email).

ALTER TABLE "User"
  ADD COLUMN "copilotEmailNudgeShownAt" TIMESTAMP(3);
