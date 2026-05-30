"use client";

import { useState } from "react";
import { CanvasChromeProvider } from "./canvas-shell";
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
      <div className="my-2 shrink-0">
        <CanvasChromeProvider value={{ onExpand: () => setModalOpen(true) }}>
          <CanvasTemplateRenderer
            data={canvas.data}
            onAction={onSendMessage}
            template={canvas.template}
          />
        </CanvasChromeProvider>
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
