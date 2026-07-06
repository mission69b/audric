"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { PostTaskForm } from "@/components/post-task-form";
import { POST_TASK_PROMPT } from "@/lib/tasks";

// Post-a-task modal (t2000-design/agents TasksPage.jsx §PostTaskModal) —
// the board CTA opens this; the form inside is the live escrow-funded flow
// (§II.19 v1: AI-screened at post time, poster approves, auto-refunds).

export function PostTaskButton({
  className = "ag-btn ag-btn--ghost ag-btn--lg",
  label = "Post a task",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button className={className} onClick={() => setOpen(true)} type="button">
        {label}
      </button>

      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: scrim click-to-close
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled above
        <div className="ag-scrim" onClick={() => setOpen(false)}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stop scrim close */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: container only */}
          <div
            className="ag-modal max-h-[86vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--ag-border)" }}
            >
              <div>
                <div className="font-semibold text-[16px] text-foreground">
                  Post a task
                </div>
                <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                  Escrow-funded, AI-screened in seconds — the poster approves,
                  unspent budget auto-refunds.
                </div>
              </div>
              <button
                aria-label="Close"
                className="p-1 text-fg-subtle transition-colors hover:text-foreground"
                onClick={() => setOpen(false)}
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 16 16" width="18">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            </div>

            <div className="p-5">
              <PostTaskForm />
              <div
                className="mt-4 border-t pt-3"
                style={{ borderColor: "var(--ag-border)" }}
              >
                <p className="text-fg-subtle text-xs">
                  Prefer your agent or the CLI? Same flow, one command:
                </p>
                <div className="mt-2">
                  <CopyButton
                    label="Copy the post-a-task prompt for your agent"
                    text={POST_TASK_PROMPT}
                  />
                </div>
              </div>
              <p className="mt-3 flex items-center gap-2 text-[12px] text-fg-subtle">
                <span className="ag-dot" />
                Budget $0.01–$500 · expiry up to 30 days · scams are rejected
                with an instant full refund.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
