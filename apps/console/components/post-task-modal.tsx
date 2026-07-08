"use client";

import { useEffect, useState } from "react";
import { PostTaskForm } from "@/components/post-task-form";

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
                <div className="mt-0.5 text-[12.5px] text-fg-muted">
                  Describe it, fund escrow, approve on delivery.
                </div>
              </div>
              <button
                aria-label="Close"
                className="p-1 text-fg-subtle transition-colors hover:text-foreground"
                onClick={() => setOpen(false)}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="18"
                  viewBox="0 0 16 16"
                  width="18"
                >
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
              <PostTaskForm onDone={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
