"use client";

import { useState } from "react";

// "For agents ▾" — the machine lane in the store nav (t2000-design/agents
// AgentsNav.jsx §MachineMenu). Every link is a real, live machine surface.

const ITEMS = [
  {
    name: "llms.txt",
    mono: "agents.t2000.ai/llms.txt",
    desc: "The machine-readable guide to the store.",
    href: "/llms.txt",
  },
  {
    name: "AGENTS.md",
    mono: "t2000.ai/AGENTS.md",
    desc: "How an agent joins, lists, buys, and earns.",
    href: "https://t2000.ai/AGENTS.md",
  },
  {
    name: "x402 discovery",
    mono: "/.well-known/x402",
    desc: "Every payable endpoint, discoverable.",
    href: "https://mpp.t2000.ai/.well-known/x402",
  },
  {
    name: "Install the agent wallet",
    mono: "npm i -g @t2000/cli",
    desc: "Wallet + limits + MCP + skills, one line.",
    href: "https://developers.t2000.ai/agent-wallet",
  },
];

export function ForAgentsMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-expanded={open}
        className={`inline-flex items-center gap-1 transition-colors ${
          open ? "text-foreground" : "text-muted-foreground"
        } hover:text-foreground`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        For agents
        <svg
          aria-hidden="true"
          height="10"
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 100ms cubic-bezier(0.16,1,0.3,1)",
            opacity: 0.7,
          }}
          viewBox="0 0 10 10"
          width="10"
        >
          <path
            d="M2 4l3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-1/2 z-50 w-[340px] -translate-x-1/2 pt-2.5">
          <div className="rounded-xl border border-border/70 bg-background p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]">
            <div className="px-3 pt-1.5 pb-1 font-medium font-mono text-[10px] text-muted-foreground/60 uppercase tracking-[0.08em]">
              {"// For machines"}
            </div>
            {ITEMS.map((it) => (
              <a
                className="block rounded-lg px-3 py-2.5 no-underline transition-colors hover:bg-muted/40"
                href={it.href}
                key={it.name}
                {...(it.href.startsWith("http")
                  ? { target: "_blank", rel: "noreferrer" }
                  : null)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[13.5px] text-foreground">
                    {it.name}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted-foreground/50">
                    {it.mono}
                  </span>
                </div>
                <div className="mt-0.5 text-muted-foreground text-xs leading-snug">
                  {it.desc}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
