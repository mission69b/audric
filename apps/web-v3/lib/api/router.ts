/**
 * `t2000/auto` — the coding-profile router for the Private Inference API
 * (SPEC_INFERENCE_DEMAND §2b, D4). Two model ids, one resolver:
 *
 * - `t2000/auto`      → bulk steps on GLM 5.2; escalation to frontier
 *                       (Claude Sonnet 5) on the three spec'd signals.
 * - `t2000/auto-open` → closed-frontier escalation WELDED SHUT — hard steps
 *                       go to the strongest open coding model instead. For
 *                       price-ceiling users and privacy purists (§1c: the
 *                       Private-mode default). Bulk is Kimi K2.7 Code
 *                       (flipped from GLM 5.2, founder call 2026-07-20:
 *                       Kimi launched free upstream while GLM bills ~$2/M
 *                       blended — dogfood showed $15+/day of GLM bulk that
 *                       Kimi serves at $0). Bulk and escalation currently
 *                       resolve to the same model; keep the split — the
 *                       moment Moonshot starts charging, re-run
 *                       scripts/api-router-eval.ts and re-bank the bulk pick.
 *
 * Design call (banked at scoping, 2026-07-14): the escalation signals are
 * DETERMINISTIC heuristics, not a per-request LLM classify. Coding agents
 * fire hundreds of small calls per session — a flat +200ms/+$0.0001 classify
 * on every request is felt; the spec's three signals (long context ·
 * plan/architecture phrasing · retry-after-failure) are all detectable
 * from the request itself. `scripts/api-router-eval.mts` is the harness
 * that arbitrates whether heuristics underperform (add LLM arbitration
 * only on evidence, not upfront).
 *
 * Billing: the route bills at the price of the model that ACTUALLY served
 * the request (no blended rates) — this module only picks the model.
 */

export const ROUTER_MODEL_IDS = ["t2000/auto", "t2000/auto-open"] as const;
export type RouterModelId = (typeof ROUTER_MODEL_IDS)[number];

/** Bulk steps — edits, test loops, renames, tool calls (~70–80% of traffic). */
export const ROUTER_BULK_MODEL = "zai/glm-5.2";
/** Bulk on t2000/auto-open — the coding-tuned open model (free upstream). */
export const ROUTER_OPEN_BULK_MODEL = "moonshotai/kimi-k2.7-code";
/** Closed-frontier escalation (t2000/auto only). */
export const ROUTER_FRONTIER_MODEL = "anthropic/claude-sonnet-5";
/** Open escalation (t2000/auto-open) — the coding-tuned open reasoner. */
export const ROUTER_OPEN_ESCALATION_MODEL = "moonshotai/kimi-k2.7-code";

/**
 * Context beyond this points the turn at a frontier long-context model.
 * ~90k tokens at ≈4 chars/token — inside GLM 5.2's window but past the range
 * where cheap open models hold quality on whole-repo reasoning.
 */
const LONG_CONTEXT_CHARS = 360_000;

/** An assistant already answered ≥ this many times → the turn can be a retry. */
const RETRY_MIN_ASSISTANT_TURNS = 2;

export function isRouterModel(id: string | undefined): id is RouterModelId {
  return id === "t2000/auto" || id === "t2000/auto-open";
}

export type RouteReason =
  | "bulk"
  | "long-context"
  | "retry-after-failure"
  | "plan-architecture";

export type RouteResolution = {
  /** The concrete catalog model that will serve (and be billed for) the turn. */
  served: string;
  reason: RouteReason;
};

type PlainMessage = { role: "user" | "assistant"; content: string };

// Failure markers in the LATEST user message — test output, stack traces, and
// "still broken" phrasing. Retry-after-failure is the strongest escalation
// signal (the cheap model just got it wrong; re-serving it the same task
// burns tokens to fail again).
const FAILURE_PATTERNS: RegExp[] = [
  /\b(?:fail(?:ed|ing|ure)?s?|error|exception|traceback|stack trace|panic(?:ked)?|regression)\b/i,
  /\b(?:still|again|didn'?t|doesn'?t|does not|won'?t|isn'?t)\b.{0,40}\b(?:work(?:ing)?|pass(?:ing)?|fix(?:ed)?|compil(?:e|ing)|build(?:ing)?|broken)\b/i,
  /\b(?:AssertionError|TypeError|ReferenceError|SyntaxError|NullPointerException|segfault|ENOENT|EACCES)\b/,
  /(?:^|\n)\s*(?:FAIL|FAILED|✕|✗|×)\s/m,
  /\bexpected\b.{0,80}\breceived\b/is,
  /\btests?\b.{0,30}\b(?:red|failing|fail)\b/i,
];

// Plan / architecture phrasing — the "hard 20%" the router should not send to
// a bulk editor model.
const PLAN_PATTERNS: RegExp[] = [
  /\barchitect(?:ure|ural)?\b/i,
  /\b(?:design|plan|structure)\b.{0,40}\b(?:system|approach|schema|architecture|migration|refactor|rollout|api|data model)\b/i,
  /\b(?:migration|refactor(?:ing)?|rollout|implementation)\s+(?:plan|strategy)\b/i,
  /\btrade-?offs?\b/i,
  /\bhow (?:should|would) (?:we|i|you)\b.{0,40}\b(?:structure|design|architect|approach|organi[sz]e)\b/i,
  /\b(?:high-?level|big-?picture)\b.{0,30}\b(?:design|plan|overview|approach)\b/i,
  /\bwrite (?:a|the) (?:spec|design doc|rfc|adr)\b/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Resolve a router model id to the concrete model that serves the turn.
 * Signals, in priority order (first hit wins):
 *
 * 1. long context     → escalate (past the open model's comfort range)
 * 2. retry-after-failure → escalate (the strongest signal — a failure marker
 *                       in the latest user message after ≥2 assistant turns)
 * 3. plan/architecture phrasing → escalate
 * 4. otherwise        → bulk (GLM 5.2 on auto; Kimi K2.7 Code on auto-open)
 */
export function resolveRouterModel({
  modelId,
  messages,
  system,
}: {
  modelId: RouterModelId;
  /** The mapped user/assistant list the route already builds. */
  messages: PlainMessage[];
  /** Joined system text (counts toward context size only). */
  system?: string;
}): RouteResolution {
  const isOpen = modelId === "t2000/auto-open";
  const escalation = isOpen ? ROUTER_OPEN_ESCALATION_MODEL : ROUTER_FRONTIER_MODEL;
  const bulk = isOpen ? ROUTER_OPEN_BULK_MODEL : ROUTER_BULK_MODEL;

  const totalChars =
    (system?.length ?? 0) + messages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > LONG_CONTEXT_CHARS) {
    return { served: escalation, reason: "long-context" };
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const assistantTurns = messages.filter((m) => m.role === "assistant").length;

  if (
    lastUser &&
    assistantTurns >= RETRY_MIN_ASSISTANT_TURNS &&
    matchesAny(lastUser.content, FAILURE_PATTERNS)
  ) {
    return { served: escalation, reason: "retry-after-failure" };
  }

  if (lastUser && matchesAny(lastUser.content, PLAN_PATTERNS)) {
    return { served: escalation, reason: "plan-architecture" };
  }

  return { served: bulk, reason: "bulk" };
}
