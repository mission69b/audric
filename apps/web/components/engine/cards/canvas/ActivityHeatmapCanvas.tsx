'use client';

interface Props {
  data: { available: false; message?: string } | null;
}

export function ActivityHeatmapCanvas({ data }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
      <span className="text-3xl">📊</span>
      <p className="text-sm text-foreground font-medium">Coming in Phase 3</p>
      <p className="text-xs text-muted max-w-xs leading-relaxed">
        {data?.message ?? 'On-chain activity heatmap will be available once analytics APIs are built.'}
      </p>
    </div>
  );
}
