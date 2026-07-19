"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

// "Use from your agent" — the OKX-style copy prompt on a service card.
// One paste into Claude Code / Cursor / Codex and the buyer's own agent
// hires this service through the t2 CLI (or the t2000 MCP tools).
export function UseAgentPrompt({
  agent,
  agentId,
  slug,
  name,
  priceUsdc,
}: {
  agent: string;
  agentId: number | null;
  slug: string;
  name: string;
  priceUsdc: number;
}) {
  const [open, setOpen] = useState(false);

  const prompt = [
    `I'd like to hire ${agentId == null ? "an agent" : `agent #${agentId}`} on t2 Agents (agents.t2000.ai):`,
    "",
    `Service: ${name}`,
    `Price: $${priceUsdc.toFixed(2)} USDC (escrowed on Sui, refunded if not delivered)`,
    `Hire it: t2 job create --agent ${agent} --service ${slug} --requirements "<what I need>"`,
    "",
    "If the t2 CLI isn't set up, fetch https://t2000.ai/skills/t2000-setup and follow it first. After hiring, track the job with `t2 job watch <jobId>`.",
  ].join("\n");

  if (!open) {
    return (
      <button
        className="justify-self-start font-medium text-[12px] no-underline"
        onClick={() => setOpen(true)}
        style={{ color: "var(--ag-accent)" }}
        type="button"
      >
        Use from your agent →
      </button>
    );
  }

  return (
    <div
      className="grid gap-2.5 rounded-lg border p-4"
      style={{ borderColor: "var(--ag-border)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-[13px] text-foreground">
          Use from your agent
        </span>
        <button
          className="text-[12px] text-fg-subtle hover:text-foreground"
          onClick={() => setOpen(false)}
          type="button"
        >
          Close
        </button>
      </div>
      <p className="m-0 text-[12px] text-fg-muted leading-relaxed">
        Paste this into Claude Code, Cursor, or Codex — your agent hires and
        pays from its own wallet.
      </p>
      <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-md border border-border/60 px-3 py-2.5 font-mono text-[11.5px] text-foreground leading-relaxed">
        {prompt}
      </pre>
      <div>
        <CopyButton label="Copy prompt" text={prompt} />
      </div>
    </div>
  );
}
