"use client";

/**
 * Settings → Developer API. Key/usage/billing management for the Private API
 * now lives in the t2000 developer platform (platform.t2000.ai) — the same
 * Passport account + credit. This is a slim pointer so Audric stays
 * consumer-focused and devs discover the platform. (v2 — SPEC_T2000_API_V2.)
 */

import { Button } from "@/components/ui/button";

export function ApiKeysSection() {
  return (
    <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
      <h2 className="mb-2 font-medium text-foreground text-sm">
        Developer API
      </h2>
      <p className="text-muted-foreground text-xs">
        Build on the t2000 Private API — every model behind{" "}
        <strong>one key</strong>, private by default, pay-as-you-go from your
        credit. Create keys, watch usage, and manage billing on the developer
        platform — same account, same balance.
      </p>
      <Button asChild className="mt-3" size="sm">
        <a href="https://platform.t2000.ai" rel="noreferrer" target="_blank">
          Open developer platform →
        </a>
      </Button>
    </div>
  );
}
