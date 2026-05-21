/**
 * `/settings/memory` — recall-oriented disclosure (Phase 3 LITE).
 *
 * Per BENEFITS_SPEC_v07d Phase 3 (Path A LITE, founder lock S.218): the
 * v0.7c signpost card is replaced with a real disclosure surface that
 * lists facts MemWal currently knows about the user. Read-only — per-
 * record delete + "explain why → source turn" are deferred to Phase 3.5
 * (waiting on MemWal SDK primitives OR a founder-locked host-side
 * provenance table).
 *
 * The page body is delegated to `<MemorySection />` (client component)
 * which fetches `/api/memory/list` and renders the appropriate state
 * (loading / cold-start / populated / unconfigured / error). This file
 * just provides the `/settings/memory` route + the settings layout
 * eyebrow.
 */

import { MemorySection } from "@/components/settings/memory-section";

export default function MemoryPage() {
  return <MemorySection />;
}
