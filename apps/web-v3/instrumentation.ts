import { registerOTel } from "@vercel/otel";

export async function register() {
  // Validate the env contract at boot — a missing/empty auth var fails the
  // deploy loudly instead of silently 401'ing every sign-in.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }
  registerOTel({ serviceName: "audric-v3" });
}
