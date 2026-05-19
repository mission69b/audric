"use client";

import { useState } from "react";
import { CanvasModal } from "./CanvasModal";
import { CanvasTemplateRenderer } from "./CanvasTemplateRenderer";

/**
 * Wire-shape for a canvas tool result. Matches the engine's
 * `render_canvas` tool output `{ template, title, data }` plus the
 * `toolUseId` the host stamps from the AI SDK `tool-call`'s
 * `toolCallId`. Defined locally so `web-v2` doesn't depend on
 * `lib/engine-types` from the legacy app.
 */
export interface CanvasData {
  template: string;
  title: string;
  data: unknown;
  toolUseId: string;
}

interface CanvasCardProps {
  canvas: CanvasData;
  onSendMessage?: (text: string) => void;
}

export function CanvasCard({ canvas, onSendMessage }: CanvasCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="my-2 overflow-hidden rounded-lg border border-border-subtle bg-surface-card/50">
        <div className="flex items-center justify-between border-border-subtle border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-fg-muted uppercase tracking-widest">
              {getTemplateLabel(canvas.template)}
            </span>
            <span className="font-medium font-mono text-[10px] text-fg-primary tracking-wider">
              {canvas.title}
            </span>
          </div>
          <button
            aria-label="Expand canvas"
            className="rounded p-0.5 text-fg-muted transition hover:text-fg-primary"
            onClick={() => setModalOpen(true)}
            title="Expand to fullscreen"
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="12"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.5"
              viewBox="0 0 12 12"
              width="12"
            >
              <path d="M1.5 4.5V1.5H4.5M7.5 1.5H10.5V4.5M10.5 7.5V10.5H7.5M4.5 10.5H1.5V7.5" />
            </svg>
          </button>
        </div>

        <div className="px-3 py-3">
          <CanvasTemplateRenderer
            data={canvas.data}
            onAction={onSendMessage}
            template={canvas.template}
          />
        </div>
      </div>

      {modalOpen && (
        <CanvasModal
          canvas={canvas}
          onClose={() => setModalOpen(false)}
          onSendMessage={onSendMessage}
        />
      )}
    </>
  );
}

function getTemplateLabel(template: string): string {
  const labels: Record<string, string> = {
    yield_projector: "SIMULATOR",
    health_simulator: "SIMULATOR",
    dca_planner: "PLANNER",
    activity_heatmap: "ANALYTICS",
    portfolio_timeline: "ANALYTICS",
    spending_breakdown: "ANALYTICS",
    watch_address: "WATCH",
    full_portfolio: "OVERVIEW",
  };
  return labels[template] ?? "CANVAS";
}
