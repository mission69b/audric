"use client";

import { useEffect } from "react";
import type { CanvasData } from "./CanvasCard";
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
        className="absolute inset-0 bg-surface-page/80 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />

      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-border-subtle bg-surface-card shadow-[var(--shadow-modal)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-border-subtle border-b bg-surface-card px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium font-mono text-[10px] text-fg-primary tracking-wider">
              {canvas.title}
            </span>
          </div>
          <button
            aria-label="Close canvas"
            className="rounded p-1 text-fg-muted transition hover:text-fg-primary"
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
              viewBox="0 0 14 14"
              width="14"
            >
              <path d="M2 2L12 12M12 2L2 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-4">
          <CanvasTemplateRenderer
            data={canvas.data}
            onAction={(text) => {
              onSendMessage?.(text);
              onClose();
            }}
            template={canvas.template}
          />
        </div>
      </div>
    </div>
  );
}
