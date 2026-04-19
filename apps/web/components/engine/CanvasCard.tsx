'use client';

import { useState } from 'react';
import type { CanvasData } from '@/lib/engine-types';
import { CanvasModal } from './CanvasModal';
import { CanvasTemplateRenderer } from './CanvasTemplateRenderer';

interface CanvasCardProps {
  canvas: CanvasData;
  onSendMessage?: (text: string) => void;
}

export function CanvasCard({ canvas, onSendMessage }: CanvasCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-border-subtle bg-surface-card/50 overflow-hidden my-2">
        {/* Title bar */}
        <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-fg-muted">
              {getTemplateLabel(canvas.template)}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-fg-primary font-medium">
              {canvas.title}
            </span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            title="Expand to fullscreen"
            className="text-fg-muted hover:text-fg-primary transition p-0.5 rounded"
            aria-label="Expand canvas"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1.5 4.5V1.5H4.5M7.5 1.5H10.5V4.5M10.5 7.5V10.5H7.5M4.5 10.5H1.5V7.5" />
            </svg>
          </button>
        </div>

        {/* Template */}
        <div className="px-3 py-3">
          <CanvasTemplateRenderer
            template={canvas.template}
            data={canvas.data}
            onAction={onSendMessage}
          />
        </div>
      </div>

      {modalOpen && (
        <CanvasModal
          canvas={canvas}
          onSendMessage={onSendMessage}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function getTemplateLabel(template: string): string {
  const labels: Record<string, string> = {
    yield_projector: 'SIMULATOR',
    health_simulator: 'SIMULATOR',
    dca_planner: 'PLANNER',
    activity_heatmap: 'ANALYTICS',
    portfolio_timeline: 'ANALYTICS',
    spending_breakdown: 'ANALYTICS',
    watch_address: 'WATCH',
    full_portfolio: 'OVERVIEW',
  };
  return labels[template] ?? 'CANVAS';
}
