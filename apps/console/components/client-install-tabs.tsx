"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

// Step-1 client switcher (/buy, founder 2026-07-08): one visible install
// command at a time — simpler than four stacked blocks, same "read it, then
// copy it" rule as the rest of the page. Facts per each client's official
// install docs.

const CLIENTS = [
  {
    id: "claude",
    label: "Claude Code",
    command: "npm i -g @anthropic-ai/claude-code",
    note: "Anthropic's terminal agent — run `claude` in any folder afterwards.",
    href: "https://code.claude.com",
  },
  {
    id: "cursor",
    label: "Cursor",
    command: "curl https://cursor.com/install -fsS | bash",
    note: "The Cursor Agent CLI — or download the full editor at cursor.com.",
    href: "https://cursor.com",
  },
  {
    id: "codex",
    label: "Codex",
    command: "npm i -g @openai/codex",
    note: "OpenAI's terminal agent — run `codex` afterwards.",
    href: "https://developers.openai.com/codex/cli",
  },
  {
    id: "hermes",
    label: "Hermes",
    command:
      "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
    note: "Nous Research's open-source agent framework — run `hermes` afterwards.",
    href: "https://github.com/NousResearch/hermes-agent",
  },
] as const;

export function ClientInstallTabs() {
  const [id, setId] = useState<(typeof CLIENTS)[number]["id"]>("claude");
  const active = CLIENTS.find((c) => c.id === id) ?? CLIENTS[0];

  return (
    <div className="max-w-[640px]">
      <div
        className="inline-flex flex-wrap gap-1 rounded-lg p-[3px]"
        style={{ background: "var(--ag-overlay)" }}
      >
        {CLIENTS.map((c) => (
          <button
            className="rounded-md px-3 py-1.5 font-medium text-[12.5px] transition-colors"
            key={c.id}
            onClick={() => setId(c.id)}
            style={
              id === c.id
                ? { background: "#fff", color: "#0a0a0a" }
                : { color: "var(--fg-muted)" }
            }
            type="button"
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="ag-term relative mt-2.5">
        <div
          className="body whitespace-pre-wrap"
          style={{
            fontSize: 12.5,
            lineHeight: 1.6,
            padding: "12px 84px 12px 14px",
          }}
        >
          <span className="m">$ </span>
          {active.command}
        </div>
        <span className="absolute top-2 right-2">
          <CopyButton text={active.command} />
        </span>
      </div>
      <p className="mt-2 mb-0 text-fg-subtle text-xs leading-relaxed">
        {active.note}{" "}
        <a
          className="underline underline-offset-4"
          href={active.href}
          rel="noreferrer"
          target="_blank"
        >
          Docs ↗
        </a>
      </p>
    </div>
  );
}
