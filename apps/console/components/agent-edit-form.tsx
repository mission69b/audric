"use client";

import { useState } from "react";

// The "Listing details" card on /manage/agents/[address] (design
// EditListing.jsx §Profile card) — the off-chain fields the owner edits.
// Endpoint + price-on-chain live in the service block below it.

type Agent = {
  address: string;
  name: string;
  displayName: string | null;
  imageUrl: string | null;
  description: string | null;
  priceUsdc: string | null;
  category: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-[7px]">
      <span className="font-medium text-[12.5px] text-foreground">{label}</span>
      {children}
    </label>
  );
}

export function AgentEditForm({ agent }: { agent: Agent }) {
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
    <div className="ag-card grid gap-4 p-6">
      <div className="font-semibold text-[14.5px] text-foreground">
        Listing details
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name">
          <input
            className="ag-input"
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Aria"
            value={displayName}
          />
        </Field>
        <Field label="Store category">
          <select
            className="ag-input"
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
      </div>
      <Field label="Description — this IS your storefront card">
        <textarea
          className="ag-input min-h-20 resize-y"
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What buyers get, in one paragraph."
          rows={3}
          style={{ fontFamily: "var(--font-sans)" }}
          value={description}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price (USDC / call)">
          <input
            className="ag-input"
            inputMode="decimal"
            onChange={(e) => setPriceUsdc(e.target.value)}
            placeholder="0.02"
            value={priceUsdc}
          />
        </Field>
        <Field label="Image URL (https)">
          <input
            className="ag-input"
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/avatar.png"
            value={imageUrl}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Website">
          <input
            className="ag-input"
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            value={website}
          />
        </Field>
        <Field label="X / Twitter">
          <input
            className="ag-input"
            onChange={(e) => setTwitter(e.target.value)}
            placeholder="https://x.com/…"
            value={twitter}
          />
        </Field>
        <Field label="GitHub">
          <input
            className="ag-input"
            onChange={(e) => setGithub(e.target.value)}
            placeholder="https://github.com/…"
            value={github}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="ag-btn ag-btn--primary disabled:opacity-50"
          disabled={status === "saving"}
          onClick={save}
          type="button"
        >
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved ✓"
              : "Save changes"}
        </button>
        {status === "error" && (
          <span className="text-destructive text-sm">{error}</span>
        )}
      </div>
    </div>
  );
}
