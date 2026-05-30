"use client";

import { useEffect } from "react";
import type { CanvasData } from "./CanvasCard";
import { CanvasChromeProvider } from "./canvas-shell";
import { CanvasTemplateRenderer } from "./CanvasTemplateRenderer";

interface CanvasModalProps {
  canvas: CanvasData;
  onSendMessage?: (text: string) => void;
  onClose: () => void;
}

export function CanvasModal({
  canvas,
  onSendMessage,
  onClose,
}: CanvasModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      aria-label={canvas.title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
    >
      <button
        aria-label="Close canvas backdrop"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />

      <div className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-[var(--shadow-float)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-border border-b bg-card px-5 py-3.5">
          <span className="font-medium text-[15px] text-foreground tracking-[-0.014em]">
            {canvas.title}
            <span className="ml-1.5 text-muted-foreground">· expanded</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              aria-label="Collapse canvas"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onClose}
              title="Collapse"
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.4"
                viewBox="0 0 16 16"
                width="14"
              >
                <path d="M6 2H2V6M10 2H14V6M14 10V14H10M2 10V14H6" />
              </svg>
            </button>
            <button
              aria-label="Close canvas"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.5"
                viewBox="0 0 16 16"
                width="14"
              >
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-5 py-5">
          <CanvasChromeProvider value={{ expanded: true }}>
            <CanvasTemplateRenderer
              data={canvas.data}
              onAction={(text) => {
                onSendMessage?.(text);
                onClose();
              }}
              template={canvas.template}
            />
          </CanvasChromeProvider>
        </div>
      </div>
    </div>
  );
}
