/**
 * Day 6-9 — Shared render primitives for v0.7a Phase 2 per-tool migration.
 *
 * Built per TOOL_UX_DESIGN_v07a.md (locked 2026-05-15). Each primitive is
 * built once and reused across multiple tools in Day 10+ migration as
 * pure assembly (no per-tool render-layer rewrite).
 *
 *   AssetAmountBlock  — 12 tools (Day 6 SHIPPED)
 *   HFGauge           — 3 tools  (Day 7 PENDING)
 *   RouteDiagram      — 2 tools  (Day 8 PENDING)
 *   PreviewCard       — 4 tools  (Day 9 PENDING)
 *   APYBlock          — 4 tools  (Day 9 PENDING)
 */

export { AssetAmountBlock } from './AssetAmountBlock';
export { HFGauge } from './HFGauge';
export { RouteDiagram } from './RouteDiagram';
export { PreviewCard } from './PreviewCard';
export type { HFImpact, FeeBreakdown } from './PreviewCard';
export { APYBlock } from './APYBlock';
