'use client';

import {
  YieldProjectorCanvas,
  HealthSimulatorCanvas,
  DCAPlanner,
  ActivityHeatmapCanvas,
  PortfolioTimelineCanvas,
  SpendingBreakdownCanvas,
} from './cards/canvas';

interface Props {
  template: string;
  data: unknown;
  onAction?: (text: string) => void;
}

export function CanvasTemplateRenderer({ template, data, onAction }: Props) {
  switch (template) {
    case 'yield_projector':
      return (
        <YieldProjectorCanvas
          data={data as Parameters<typeof YieldProjectorCanvas>[0]['data']}
          onAction={onAction}
        />
      );
    case 'health_simulator':
      return (
        <HealthSimulatorCanvas
          data={data as Parameters<typeof HealthSimulatorCanvas>[0]['data']}
          onAction={onAction}
        />
      );
    case 'dca_planner':
      return (
        <DCAPlanner
          data={data as Parameters<typeof DCAPlanner>[0]['data']}
          onAction={onAction}
        />
      );
    case 'activity_heatmap':
      return (
        <ActivityHeatmapCanvas
          data={data as Parameters<typeof ActivityHeatmapCanvas>[0]['data']}
        />
      );
    case 'portfolio_timeline':
      return (
        <PortfolioTimelineCanvas
          data={data as Parameters<typeof PortfolioTimelineCanvas>[0]['data']}
        />
      );
    case 'spending_breakdown':
      return (
        <SpendingBreakdownCanvas
          data={data as Parameters<typeof SpendingBreakdownCanvas>[0]['data']}
        />
      );
    default:
      return (
        <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
          <span className="text-3xl">🖼️</span>
          <p className="text-sm text-muted">Canvas template &ldquo;{template}&rdquo; is not yet available.</p>
        </div>
      );
  }
}
