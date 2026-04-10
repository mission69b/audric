'use client';

import { useEffect } from 'react';
import type { CanvasData } from '@/lib/engine-types';
import { CanvasTemplateRenderer } from './CanvasTemplateRenderer';

interface CanvasModalProps {
  canvas: CanvasData;
  onSendMessage?: (text: string) => void;
  onClose: () => void;
}

export function CanvasModal({ canvas, onSendMessage, onClose }: CanvasModalProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={canvas.title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 px-4 py-3 border-b border-border flex items-center justify-between bg-surface z-10">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-wider text-foreground font-medium">
              {canvas.title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-dim hover:text-foreground transition p-1 rounded"
            aria-label="Close canvas"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2L12 12M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Template */}
        <div className="px-4 py-4">
          <CanvasTemplateRenderer
            template={canvas.template}
            data={canvas.data}
            onAction={(text) => {
              onSendMessage?.(text);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
