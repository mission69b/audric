-- Wave C.4 — Copilot settings: HF widget visibility toggle
-- Lets users hide the always-on health-factor widget (Wave C.5) from the
-- dashboard while keeping critical hf_alert emails on.

ALTER TABLE "User"
  ADD COLUMN "hfWidgetEnabled" BOOLEAN NOT NULL DEFAULT true;
