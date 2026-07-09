"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// The service CATALOG editor on /manage/agents/[address] (S.693 — founder GO
// reversing S.656's read-only card): the confirmed owner (or the self-agent)
// edits slug-addressed SKUs from the browser. REPLACE semantics against
// /api/agent/services — the same catalog `t2 agent services` manages from
// the CLI. Each SKU's buy URL: x402.t2000.ai/commerce/pay/{agent}/{slug}.

export type EditableService = {
  slug: string;
  title: string;
  description: string;
  priceUsdc: string;
  input?: string | null;
  endpoint?: string | null;
  method?: "GET" | "POST";
  active: boolean;
};

const EMPTY: EditableService = {
  slug: "",
  title: "",
  description: "",
  priceUsdc: "0.02",
  input: "",
  endpoint: "",
  method: "POST",
  active: true,
};

function Field({
  label,
  children,
  grow = false,
}: {
  label: string;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <div className={`grid gap-[7px] ${grow ? "flex-1" : ""}`}>
      <span className="font-medium text-[12.5px] text-foreground">{label}</span>
      {children}
    </div>
  );
}

export function CatalogEditor({
  agent,
  initial,
  hostedSlugs = [],
}: {
  agent: string;
  initial: EditableService[];
  /** Slugs with a LIVE deployed handler (S.697): these deliver via t2000
   *  compute — the endpoint fields are hidden so a stray endpoint can't
   *  shadow the handler. */
  hostedSlugs?: string[];
}) {
  const router = useRouter();
  const [services, setServices] = useState<EditableService[]>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  const patch = (i: number, p: Partial<EditableService>) => {
    setServices((prev) => prev.map((s, j) => (j === i ? { ...s, ...p } : s)));
    setStatus("idle");
  };

  const save = async () => {
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/agent/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent, services }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Couldn't save the catalog.");
      }
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the catalog.");
      setStatus("error");
    }
  };

  return (
    <div className="ag-card p-5">
      <div className="ag-eyebrow">{"// SERVICES"}</div>
      <p className="mt-2 mb-0 text-[13px] text-fg-muted">
        What this agent sells — each service gets its own buy URL and price.
        Point it at an https endpoint you run (POST gets the buyer's input; GET
        just fetches). Buyers pay per call; you earn to the agent's wallet.
      </p>

      <div className="mt-4 grid gap-4">
        {services.map((s, i) => (
          <div
            className="grid gap-3 rounded-xl border border-border/60 p-4"
            key={`svc-${i.toString()}`}
          >
            <div className="flex flex-wrap items-end gap-3">
              <Field grow label="Slug (in the buy URL)">
                <input
                  className="ag-input font-mono"
                  onChange={(e) =>
                    patch(i, {
                      slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    })
                  }
                  placeholder="whale-alerts"
                  value={s.slug}
                />
              </Field>
              <Field label="Price (USDC)">
                <input
                  className="ag-input w-28 font-mono"
                  inputMode="decimal"
                  onChange={(e) => patch(i, { priceUsdc: e.target.value })}
                  placeholder="0.02"
                  value={s.priceUsdc}
                />
              </Field>
              <label className="mb-2 flex items-center gap-2 text-[12.5px] text-fg-muted">
                <input
                  checked={s.active}
                  onChange={(e) => patch(i, { active: e.target.checked })}
                  type="checkbox"
                />
                Active
              </label>
            </div>
            <Field label="Title">
              <input
                className="ag-input"
                maxLength={80}
                onChange={(e) => patch(i, { title: e.target.value })}
                placeholder="Whale alerts — large inflows, one call"
                value={s.title}
              />
            </Field>
            <Field label="Description (what the buyer gets · Provide: inputs)">
              <textarea
                className="ag-input min-h-16 resize-y"
                maxLength={480}
                onChange={(e) => patch(i, { description: e.target.value })}
                placeholder="Returns the last 24h of large USDC inflows… Provide: 1. token 2. min amount."
                value={s.description}
              />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              {hostedSlugs.includes(s.slug) ? (
                <div className="flex-1 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[12px] text-fg-muted">
                  <span className="text-emerald-500">Hosted on t2000</span> —
                  delivered by your deployed handler (Deploy card above). No
                  endpoint needed.
                </div>
              ) : (
                <>
                  <Field
                    grow
                    label="Endpoint (https — where t2000 fetches the result)"
                  >
                    <input
                      className="ag-input font-mono"
                      onChange={(e) => patch(i, { endpoint: e.target.value })}
                      placeholder="https://api.example.com/whale-alerts"
                      value={s.endpoint ?? ""}
                    />
                  </Field>
                  <Field label="Method">
                    <select
                      className="ag-input w-24"
                      onChange={(e) =>
                        patch(i, {
                          method: e.target.value === "GET" ? "GET" : "POST",
                        })
                      }
                      value={s.method ?? "POST"}
                    >
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                    </select>
                  </Field>
                </>
              )}
              <button
                className="ag-btn ag-btn--ghost ag-btn--sm mb-1 text-fg-subtle"
                onClick={() => {
                  setServices((prev) => prev.filter((_, j) => j !== i));
                  setStatus("idle");
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm"
          onClick={() => setServices((prev) => [...prev, { ...EMPTY }])}
          type="button"
        >
          + Add service
        </button>
        <button
          className="ag-btn ag-btn--sm"
          disabled={status === "saving"}
          onClick={save}
          type="button"
        >
          {status === "saving" ? "Saving…" : "Save catalog"}
        </button>
        {status === "saved" && (
          <span className="text-[12.5px] text-fg-muted">
            Saved — live on the store in ~30s.
          </span>
        )}
        {status === "error" && (
          <span className="text-[12.5px] text-destructive">{error}</span>
        )}
      </div>

      <p className="mt-3 mb-0 font-mono text-[11.5px] text-fg-subtle leading-[1.55]">
        Same catalog from the CLI: `t2 agent services add …` or `t2 agent
        services sync ./services.json`. Wrapping a keyed API (t2000 hosts the
        proxy, your key encrypted) stays CLI-side: `t2 agent deploy`.
      </p>
    </div>
  );
}
