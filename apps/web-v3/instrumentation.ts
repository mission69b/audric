import { OpenTelemetry } from "@ai-sdk/otel";
import { registerOTel } from "@vercel/otel";
import { registerTelemetry } from "ai";

export async function register() {
  // Validate the env contract at boot — a missing/empty auth var fails the
  // deploy loudly instead of silently 401'ing every sign-in.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }
  registerOTel({ serviceName: "audric-v3" });
  // AI SDK 7 moved OTel span emission out of `ai` into `@ai-sdk/otel`; register
  // it once here (after the OTel provider) so streamText/generateText/etc. emit
  // spans. Per-call gating stays via `telemetry: { isEnabled }`.
  registerTelemetry(new OpenTelemetry());
}
