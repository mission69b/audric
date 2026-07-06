"use client";

import { useEffect, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";

type Agent = {
  address: string;
  numericId: number | null;
  name: string;
  displayName: string | null;
  imageUrl: string | null;
  description: string | null;
  priceUsdc: string | null;
  category: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  mcpEndpoint: string | null;
  active: boolean;
};

// Mirrors AGENT_CATEGORIES (@audric/accounts) — the store's chip set.
const CATEGORIES = [
  "ai-models",
  "data-feeds",
  "finance",
  "research",
  "dev-tools",
  "creative",
  "other",
] as const;

type Earnings = {
  sales: number;
  volumeUsd: number;
  buyers: number;
} | null;

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="text-muted-foreground/70 text-xs">{label}</span>
      {children}
    </div>
  );
}

const inputCls = "ag-input mt-1";

export function AgentManageCard({
  agent,
  earnings,
}: {
  agent: Agent;
  earnings: Earnings;
}) {
  const [displayName, setDisplayName] = useState(agent.displayName ?? "");
  const [imageUrl, setImageUrl] = useState(agent.imageUrl ?? "");
  const [description, setDescription] = useState(agent.description ?? "");
  const [priceUsdc, setPriceUsdc] = useState(agent.priceUsdc ?? "");
  const [category, setCategory] = useState(agent.category ?? "");
  const [website, setWebsite] = useState(agent.website ?? "");
  const [twitter, setTwitter] = useState(agent.twitter ?? "");
  const [github, setGithub] = useState(agent.github ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  async function save() {
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/agent/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent: agent.address,
          displayName,
          imageUrl,
          description,
          priceUsdc,
          category,
          website,
          twitter,
          github,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Save failed.");
        setStatus("error");
        return;
      }
      setStatus("saved");
    } catch {
      setError("Network error.");
      setStatus("error");
    }
  }

  // Address anchor — the public listing's "Manage it" bar deep-links here
  // (/manage/agents#0x…): auto-expand the editor for that agent.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (window.location.hash === `#${agent.address}`) {
      setOpen(true);
    }
  }, [agent.address]);

  return (
    // Compact row per t2000-design/agents ManageConsole §AgentsPanel;
    // "Manage" expands the editor in place.
    <div className="ag-card scroll-mt-24" id={agent.address}>
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <AgentAvatar
          address={agent.address}
          imageUrl={agent.imageUrl}
          name={agent.displayName || agent.name}
          size={42}
        />
        <div className="min-w-[180px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[15px] text-foreground">
              {agent.displayName || agent.name}
            </span>
            {agent.numericId != null && (
              <span className="font-mono text-muted-foreground/60 text-xs">
                #{agent.numericId}
              </span>
            )}
            <span className="font-mono text-muted-foreground/50 text-xs">
              {short(agent.address)}
            </span>
          </div>
          {earnings && earnings.sales > 0 ? (
            <div className="ag-rep ag-tabular mt-1" style={{ fontSize: 11.5 }}>
              <span>
                <b>{earnings.sales}</b> sold
              </span>
              <span className="sep">·</span>
              <span>
                <b>${earnings.volumeUsd.toFixed(2)}</b> earned
              </span>
              <span className="sep">·</span>
              <span>
                <b>{earnings.buyers}</b> buyer{earnings.buyers === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <div className="mt-1 font-mono text-[11.5px] text-muted-foreground/50">
              no sales yet
            </div>
          )}
        </div>
        {agent.active && (
          <span className="ag-verified px-2.5 py-0.5">
            <span className="ag-dot" style={{ width: 5, height: 5 }} /> Live
          </span>
        )}
        <a
          className="ag-btn ag-btn--ghost ag-btn--sm"
          href={`https://agents.t2000.ai/${agent.address}`}
          rel="noreferrer"
          target="_blank"
        >
          View
        </a>
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {open && (
        <div
          className="border-t px-5 pb-5"
          style={{ borderColor: "var(--ag-border)" }}
        >
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Display name">
          <input
            className={inputCls}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Aria"
            value={displayName}
          />
        </Field>
        <Field label="Price (USDC / call)">
          <input
            className={inputCls}
            inputMode="decimal"
            onChange={(e) => setPriceUsdc(e.target.value)}
            placeholder="0.02"
            value={priceUsdc}
          />
        </Field>
        <Field label="Store category">
          <select
            className={inputCls}
            onChange={(e) => setCategory(e.target.value)}
            value={category}
          >
            <option value="">— none —</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Image URL (https)">
          <input
            className={inputCls}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/avatar.png"
            value={imageUrl}
          />
        </Field>
        <Field label="Description">
          <input
            className={inputCls}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this agent does."
            value={description}
          />
        </Field>
        <Field label="Website (https)">
          <input
            className={inputCls}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            value={website}
          />
        </Field>
        <Field label="X / Twitter (https)">
          <input
            className={inputCls}
            onChange={(e) => setTwitter(e.target.value)}
            placeholder="https://x.com/…"
            value={twitter}
          />
        </Field>
        <Field label="GitHub (https)">
          <input
            className={inputCls}
            onChange={(e) => setGithub(e.target.value)}
            placeholder="https://github.com/…"
            value={github}
          />
        </Field>
      </div>

          {agent.mcpEndpoint && (
            <p className="mt-3 text-muted-foreground/60 text-xs">
              Service endpoint:{" "}
              <span className="font-mono break-all">{agent.mcpEndpoint}</span>{" "}
              — changed on-chain by the agent (
              <span className="font-mono">t2 agent service / deploy</span>).
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-50"
              disabled={status === "saving"}
              onClick={save}
              type="button"
            >
              {status === "saving" ? "Saving…" : "Save"}
            </button>
            {status === "saved" && (
              <span className="text-sm" style={{ color: "var(--ag-verify)" }}>
                Saved ✓
              </span>
            )}
            {status === "error" && (
              <span className="text-destructive text-sm">{error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
