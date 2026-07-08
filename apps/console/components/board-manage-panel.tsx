"use client";

import { useState } from "react";
import { GATEWAY_BASE } from "@/lib/tasks";

// Poster review panel (S.626.1) — paste the manageKey from posting, see full
// submissions, approve/reject in batch. Everything server-side is gated on
// the key; this panel is just a nicer curl.
type Submission = {
  id: string;
  worker: string;
  proof?: string;
  url?: string | null;
  status: string;
  at: string;
};

export function BoardManagePanel({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [manageKey, setManageKey] = useState("");
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(
        `${GATEWAY_BASE}/tasks/board/${taskId}?manageKey=${encodeURIComponent(manageKey.trim())}`
      );
      const json = (await res.json()) as {
        posterView?: boolean;
        submissions?: Submission[];
        error?: string;
      };
      if (json.posterView) {
        setSubs(json.submissions ?? []);
        setSelected(new Set());
      } else {
        setSubs(null);
        setMessage(json.error ?? "Key not accepted for this task.");
      }
    } catch {
      setMessage("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "approve" | "reject") {
    if (selected.size === 0) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`${GATEWAY_BASE}/tasks/board/${taskId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manageKey: manageKey.trim(),
          submissionIds: [...selected],
          action,
        }),
      });
      const json = (await res.json()) as {
        paid?: number;
        results?: { submissionId: string; status: string; error?: string }[];
        error?: string;
      };
      if (json.results) {
        const errors = json.results.filter((r) => r.error);
        setMessage(
          `${action === "approve" ? `Paid ${json.paid ?? 0}` : "Rejected"} of ${json.results.length}${errors.length > 0 ? ` · ${errors.length} issue${errors.length === 1 ? "" : "s"}: ${errors[0].error}` : ""}`
        );
        await load();
      } else {
        setMessage(json.error ?? "Action failed.");
      }
    } catch {
      setMessage("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "ag-input";
  const pending = (subs ?? []).filter((s) => s.status === "pending");

  if (!open) {
    return (
      <button
        className="mt-2 text-muted-foreground/60 text-xs underline underline-offset-4 transition-colors hover:text-foreground"
        onClick={() => setOpen(true)}
        type="button"
      >
        Posted this task? Review submissions →
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} max-w-72`}
          onChange={(e) => setManageKey(e.target.value)}
          placeholder="manageKey (bmk_…)"
          value={manageKey}
        />
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm disabled:opacity-50"
          disabled={busy || !manageKey.trim()}
          onClick={load}
          type="button"
        >
          {busy ? "Loading…" : "Load submissions"}
        </button>
        {message && (
          <span className="text-muted-foreground text-xs">{message}</span>
        )}
      </div>

      {subs !== null && (
        <div className="mt-3">
          {subs.length === 0 ? (
            <p className="text-muted-foreground/60 text-xs">
              No submissions yet.
            </p>
          ) : (
            <>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {subs.map((s) => (
                  <label
                    className="flex items-start gap-2 rounded-lg border border-border/40 bg-card/40 p-2 text-xs"
                    key={s.id}
                  >
                    <input
                      checked={selected.has(s.id)}
                      className="mt-0.5"
                      disabled={s.status !== "pending"}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) {
                          next.add(s.id);
                        } else {
                          next.delete(s.id);
                        }
                        setSelected(next);
                      }}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-muted-foreground">
                        {s.worker.slice(0, 10)}… ·{" "}
                        <span
                          className={
                            s.status === "paid"
                              ? "text-emerald-500"
                              : s.status === "rejected"
                                ? "text-destructive"
                                : "text-foreground"
                          }
                        >
                          {s.status}
                        </span>
                      </span>
                      {s.proof && (
                        <span className="mt-0.5 block text-foreground [overflow-wrap:anywhere]">
                          {s.proof}
                        </span>
                      )}
                      {s.url && (
                        <a
                          className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          href={s.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          proof link ↗
                        </a>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  className="text-muted-foreground/70 text-xs underline underline-offset-4 hover:text-foreground"
                  onClick={() => setSelected(new Set(pending.map((s) => s.id)))}
                  type="button"
                >
                  Select all pending ({pending.length})
                </button>
                <button
                  className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-50"
                  disabled={busy || selected.size === 0}
                  onClick={() => act("approve")}
                  type="button"
                >
                  Approve & pay ({selected.size})
                </button>
                <button
                  className="ag-btn ag-btn--ghost ag-btn--sm disabled:opacity-50"
                  disabled={busy || selected.size === 0}
                  onClick={() => act("reject")}
                  type="button"
                >
                  Reject ({selected.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
