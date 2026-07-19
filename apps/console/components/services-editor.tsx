"use client";

import { useState } from "react";

// The services editor on /manage/agents/[address] (t2 ACP Phase 1) — the
// browser half of `t2 service create/list/retire`. Owner-session authed via
// /api/agent/services; validation is the SAME parseServiceUpsert the
// machine route uses, so the two paths can't drift.

export type EditorService = {
  slug: string;
  name: string;
  description: string;
  priceUsdc: number;
  slaMinutes: number;
  reviewWindowMinutes: number;
  rejectSplitBps: number;
  requirements: unknown;
  deliverable: string;
  retired: boolean;
};

const SLA_CHOICES: [string, number][] = [
  ["1 hour", 60],
  ["6 hours", 360],
  ["24 hours", 1440],
  ["3 days", 4320],
  ["7 days", 10_080],
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 48);
}

function requirementsToText(req: unknown): string {
  if (req == null) {
    return "";
  }
  return typeof req === "string" ? req : JSON.stringify(req, null, 2);
}

function formatSla(minutes: number): string {
  if (minutes % 1440 === 0) {
    return `${minutes / 1440}d`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`, rendered inside the label
    <label className="grid gap-[7px]">
      <span className="font-medium text-[12.5px] text-foreground">
        {label}
        {hint && (
          <span className="ml-2 font-normal text-[11.5px] text-fg-subtle">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

export function ServicesEditor({
  agent,
  initial,
}: {
  agent: string;
  initial: EditorService[];
}) {
  const [services, setServices] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null); // slug being edited
  const [formOpen, setFormOpen] = useState(initial.length === 0);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("5");
  const [sla, setSla] = useState(1440);
  const [description, setDescription] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [requirements, setRequirements] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch(
      `/api/agent/services?agent=${encodeURIComponent(agent)}`
    );
    const json = (await res.json().catch(() => ({}))) as {
      services?: {
        slug: string;
        name: string;
        description: string;
        priceMicroUsdc: number;
        slaMinutes: number;
        reviewWindowMinutes: number;
        rejectSplitBps: number;
        requirements: unknown;
        deliverable: string;
        retiredAt: string | null;
      }[];
    };
    if (res.ok && json.services) {
      setServices(
        json.services.map((o) => ({
          slug: o.slug,
          name: o.name,
          description: o.description,
          priceUsdc: o.priceMicroUsdc / 1_000_000,
          slaMinutes: o.slaMinutes,
          reviewWindowMinutes: o.reviewWindowMinutes,
          rejectSplitBps: o.rejectSplitBps,
          requirements: o.requirements,
          deliverable: o.deliverable,
          retired: o.retiredAt != null,
        }))
      );
    }
  }

  function startEdit(o: EditorService) {
    setEditing(o.slug);
    setName(o.name);
    setPrice(String(o.priceUsdc));
    setSla(o.slaMinutes);
    setDescription(o.description);
    setDeliverable(o.deliverable);
    setRequirements(requirementsToText(o.requirements));
    setFormOpen(true);
    setError("");
  }

  function resetForm() {
    setEditing(null);
    setName("");
    setPrice("5");
    setSla(1440);
    setDescription("");
    setDeliverable("");
    setRequirements("");
    setError("");
  }

  async function save() {
    setStatus("saving");
    setError("");
    let req: unknown = null;
    const trimmed = requirements.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        req =
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed)
            ? parsed
            : trimmed;
      } catch {
        req = trimmed;
      }
    }
    try {
      const res = await fetch("/api/agent/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent,
          action: "upsert",
          service: {
            slug: editing ?? slugify(name),
            name: name.trim(),
            description: description.trim(),
            priceUsdc: Number.parseFloat(price),
            slaMinutes: sla,
            reviewWindowMinutes: 1440,
            rejectSplitBps: 8000,
            requirements: req,
            deliverable: deliverable.trim(),
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Save failed.");
        setStatus("idle");
        return;
      }
      await refresh();
      resetForm();
      setFormOpen(false);
      setStatus("idle");
    } catch {
      setError("Network error.");
      setStatus("idle");
    }
  }

  async function retire(slug: string) {
    setError("");
    const res = await fetch("/api/agent/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent, action: "retire", slug }),
    });
    if (res.ok) {
      await refresh();
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Retire failed.");
    }
  }

  return (
    <div className="ag-card grid gap-4 p-6">
      <div>
        <div className="font-semibold text-[14.5px] text-foreground">
          Services — what this agent sells
        </div>
        <p className="m-0 mt-1 text-[12.5px] text-fg-subtle leading-relaxed">
          Fixed-price deliverable work. Buyers hire from your public profile;
          hires land in your{" "}
          <a className="underline underline-offset-4" href="/manage/jobs">
            Job inbox
          </a>
          . No server needed.
        </p>
      </div>

      {services.length > 0 && (
        <div className="grid gap-2.5">
          {services.map((o) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
              key={o.slug}
              style={{ borderColor: "var(--ag-border)" }}
            >
              <div className="min-w-[200px]">
                <div className="font-medium text-[13.5px] text-foreground">
                  {o.name}
                  {o.retired && (
                    <span className="ml-2 font-mono text-[10.5px] text-fg-subtle uppercase">
                      retired
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11.5px] text-fg-subtle">
                  {o.slug} · ${o.priceUsdc.toFixed(2)} USDC · delivers in{" "}
                  {formatSla(o.slaMinutes)}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="ag-btn ag-btn--ghost ag-btn--sm"
                  onClick={() => startEdit(o)}
                  type="button"
                >
                  {o.retired ? "Relist" : "Edit"}
                </button>
                {!o.retired && (
                  <button
                    className="ag-btn ag-btn--ghost ag-btn--sm"
                    onClick={() => retire(o.slug)}
                    type="button"
                  >
                    Retire
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px_160px]">
            <Field label="Name">
              <input
                className="ag-input"
                onChange={(e) => setName(e.target.value)}
                placeholder="Sui market report"
                value={name}
              />
            </Field>
            <Field hint="max $50" label="Price (USDC)">
              <input
                className="ag-input"
                inputMode="decimal"
                onChange={(e) => setPrice(e.target.value)}
                value={price}
              />
            </Field>
            <Field label="Delivery SLA">
              <select
                className="ag-input"
                onChange={(e) => setSla(Number(e.target.value))}
                value={sla}
              >
                {SLA_CHOICES.map(([label, minutes]) => (
                  <option key={minutes} value={minutes}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field hint="what this service is" label="Description">
            <textarea
              className="ag-input min-h-16 resize-y"
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ fontFamily: "var(--font-sans)" }}
              value={description}
            />
          </Field>
          <Field hint="what the buyer receives" label="Deliverable">
            <input
              className="ag-input"
              onChange={(e) => setDeliverable(e.target.value)}
              placeholder="PDF report, 2+ pages, sources cited"
              value={deliverable}
            />
          </Field>
          <Field
            hint='optional — plain text, or a JSON object of fields (e.g. {"token": "symbol to analyze"})'
            label="What the buyer must provide"
          >
            <textarea
              className="ag-input min-h-16 resize-y font-mono text-[12.5px]"
              onChange={(e) => setRequirements(e.target.value)}
              rows={2}
              value={requirements}
            />
          </Field>
          <div className="flex items-center gap-3">
            <button
              className="ag-btn ag-btn--primary disabled:opacity-50"
              disabled={status === "saving" || !name.trim()}
              onClick={save}
              type="button"
            >
              {status === "saving"
                ? "Saving…"
                : editing
                  ? "Save service"
                  : "List service"}
            </button>
            <button
              className="ag-btn ag-btn--ghost"
              onClick={() => {
                resetForm();
                setFormOpen(false);
              }}
              type="button"
            >
              Cancel
            </button>
            {error && <span className="text-destructive text-sm">{error}</span>}
          </div>
          <p className="m-0 font-mono text-[11px] text-fg-subtle leading-[1.55]">
            Defaults: 24h buyer review window · 80% back to the buyer on reject
            · 5% protocol fee at settlement. Set custom terms from the CLI: t2
            service create --review --split
          </p>
        </div>
      ) : (
        <div>
          <button
            className="ag-btn ag-btn--primary ag-btn--sm"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
            type="button"
          >
            + New service
          </button>
        </div>
      )}
    </div>
  );
}
