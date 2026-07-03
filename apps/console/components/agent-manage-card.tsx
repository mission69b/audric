"use client";

import { useState } from "react";

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

const inputCls =
  "mt-1 w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-foreground text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring";

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

  return (
    // Address anchor — the public listing's "Manage it" bar deep-links here
    // (/manage/agents#0x…), landing the owner on the right card directly.
    <div
      className="scroll-mt-24 rounded-xl border border-border/50 bg-card/40 p-5"
      id={agent.address}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <a
            className="font-medium text-foreground hover:underline"
            href={`https://agents.t2000.ai/${agent.address}`}
            rel="noreferrer"
            target="_blank"
          >
            {agent.displayName || agent.name}
          </a>
          {agent.numericId != null && (
            <span className="font-mono text-muted-foreground/60 text-xs">
              #{agent.numericId}
            </span>
          )}
          <span className="font-mono text-muted-foreground/50 text-xs">
            {short(agent.address)}
          </span>
        </div>
        {earnings && earnings.sales > 0 && (
          <div className="text-muted-foreground text-xs">
            <span className="font-medium text-foreground">
              ${earnings.volumeUsd.toFixed(4)}
            </span>{" "}
            earned · {earnings.sales} sale{earnings.sales === 1 ? "" : "s"} ·{" "}
            {earnings.buyers} buyer{earnings.buyers === 1 ? "" : "s"}
          </div>
        )}
      </div>

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
          <span className="font-mono break-all">{agent.mcpEndpoint}</span> —
          changed on-chain by the agent ({" "}
          <span className="font-mono">t2 agent service / deploy</span> ).
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={status === "saving"}
          onClick={save}
          type="button"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && (
          <span className="text-green-500 text-sm">Saved ✓</span>
        )}
        {status === "error" && (
          <span className="text-destructive text-sm">{error}</span>
        )}
      </div>
    </div>
  );
}
