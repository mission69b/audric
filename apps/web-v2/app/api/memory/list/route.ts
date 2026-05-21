/**
 * `GET /api/memory/list` — list facts MemWal currently knows about the user.
 *
 * Powers the `/settings/memory` disclosure surface per BENEFITS_SPEC_v07d
 * Phase 3 (Path A LITE — see S.218). The page shows "what your agent
 * currently knows about you" so users can verify the memory layer is
 * working without surprise.
 *
 * --- WHY A BROAD QUERY (not a "list all") ---
 *
 * MemWal SDK 0.0.4 has no namespace-listing primitive. `restore()`
 * returns only counters; per-record enumeration isn't exposed. The
 * only data-bearing API is `recall(query, limit, namespace)` which
 * returns top-K records by similarity to a query.
 *
 * We approximate "list everything" by sending a deliberately broad
 * query that overlaps with most likely fact embeddings. The choice
 * below ("user preferences finances assets trading risk goals
 * communication") covers the dominant audric fact categories from
 * `analyze()` extractions. Facts that don't semantically overlap with
 * this query MAY be omitted from the disclosure list — they remain
 * intact in MemWal and continue to power chat recall on contextually-
 * relevant turns. We document this limitation in the UI copy
 * (`memory-section.tsx`) and revisit when MemWal SDK ships
 * `listNamespace()` or similar.
 *
 * --- WHAT THIS DOES NOT DO (Phase 3.5 backlog) ---
 *
 *   - Per-record provenance ("explain why → chat turn"). Would require
 *     a host-side Postgres table correlating `analyze().job_ids` to
 *     `{ sessionId, turnIndex }` at write time. Deferred until either
 *     (a) MemWal SDK exposes turn metadata on records, or (b) founder
 *     locks the Postgres correlation table as part of Phase 3.5.
 *   - Per-record delete ("forget this"). MemWal SDK has no per-record
 *     delete; would require host-side soft-delete tombstone table +
 *     recall-time filter. Same deferral logic as above.
 *   - Recall-frequency ranking. Would require host-side counter
 *     incremented on every recall hit. Deferred.
 *
 * Today users can still clear remembered context via chat ("Hey
 * Audric, forget what you know about X"); the disclosure surface
 * is purely informational.
 *
 * --- RESPONSE SHAPE ---
 *
 *   Success:        { status: 'ok', records: [{ text: string }, ...] }
 *   Cold start:     { status: 'ok', records: [] }
 *   Not configured: { status: 'memwal-unconfigured', records: [] }
 *   Error:          { status: 'error', error: string, records: [] }
 *
 * All responses are 200 with `status` discriminator — the page renders
 * different empty states by inspecting `status` rather than the HTTP
 * code. The only non-200 path is unauthenticated → 401.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/audric-auth";
import { memwal } from "@/lib/memwal";

/**
 * Broad query designed to overlap with most fact embeddings extracted
 * by MemWal's `analyze()` server LLM from audric chat. Covers the
 * dominant fact categories surfaced in production smoke tests
 * (DCA preferences, slippage tolerance, wallet composition, etc.).
 * Documented as an approximation pending MemWal SDK list-namespace
 * support.
 */
const BROAD_LIST_QUERY =
  "user preferences finances assets trading risk goals communication";

const MAX_RECORDS = 20;

interface MemoryListRecord {
  text: string;
}

type MemoryListResponse =
  | { status: "ok"; records: MemoryListRecord[] }
  | { status: "memwal-unconfigured"; records: [] }
  | { status: "error"; error: string; records: [] };

export async function GET(): Promise<NextResponse<MemoryListResponse>> {
  // 1. Auth gate — same pattern as `app/api/chat/route.ts` L307.
  const session = await getCurrentUser();
  if (!session?.user) {
    return NextResponse.json(
      // The /settings/memory page is wrapped in <AuthGuard /> so this
      // path should be unreachable from the UI; we still return the
      // discriminator shape so CLI / API consumers don't crash.
      { status: "error", error: "unauthorized", records: [] },
      { status: 401 }
    );
  }
  const walletAddress = session.user.id;

  // 2. MemWal client check. The `memwal` singleton is null when
  // `MEMWAL_PRIVATE_KEY` / `MEMWAL_ACCOUNT_ID` env vars are unset
  // (dev defaults). Fail-open: surface the unconfigured state to the
  // UI so it can render an explainer instead of a generic "loading"
  // spinner that never resolves.
  if (!memwal) {
    return NextResponse.json({
      status: "memwal-unconfigured",
      records: [],
    });
  }

  // 3. Recall against the broad query, scoped to the user's namespace.
  // Mirrors the namespace shape `memwal-prepare-step.ts` recalls from
  // and `memwal-write-callback.ts` writes to — keep them in lockstep
  // or the disclosure page renders a different store than what the
  // chat agent sees.
  const namespace = `audric:user:${walletAddress}`;
  try {
    const result = await memwal.recall(
      BROAD_LIST_QUERY,
      MAX_RECORDS,
      namespace
    );
    console.info(
      `[web-v2 memory-list] ok: count=${result.results.length} namespace=${namespace.slice(0, 16)}...`
    );
    return NextResponse.json({
      status: "ok",
      records: result.results.map((r) => ({ text: r.text })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[web-v2 memory-list] recall failed:", message);
    return NextResponse.json({
      status: "error",
      error: message,
      records: [],
    });
  }
}
