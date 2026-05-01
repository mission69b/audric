'use client';

import type { CanvasTimelineBlock } from '@/lib/engine-types';
import { CanvasCard } from '../CanvasCard';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — CanvasBlockView (B2.2)
//
// Thin adapter around the existing CanvasCard. CanvasCard expects a
// CanvasData shape; the block carries the same fields under different
// names (no shape difference at runtime — TodoUpdate / Canvas / Tool
// blocks were defined to mirror existing component props for exactly
// this reason).
// ───────────────────────────────────────────────────────────────────────────

interface CanvasBlockViewProps {
  block: CanvasTimelineBlock;
  onSendMessage?: (text: string) => void;
}

export function CanvasBlockView({ block, onSendMessage }: CanvasBlockViewProps) {
  return (
    <CanvasCard
      canvas={{
        template: block.template,
        title: block.title,
        data: block.data,
        toolUseId: block.toolUseId,
      }}
      onSendMessage={onSendMessage}
    />
  );
}
