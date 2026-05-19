/**
 * Chip configurations — Audric's seven quick-prompt entry points.
 *
 * Architectural correction locked in CHIP_REVIEW_3 (2026-05-19): chips
 * are INJECTION-ONLY. A chip tap fills the composer with a canonical
 * prompt and focuses the input. The user reads, edits, hits Enter —
 * and the agent handles the rest via natural language.
 *
 * The legacy apps/web implementation shipped two competing modes:
 *   1. PROMPT MODE — inject a sentence into the composer (this mode).
 *   2. FLOW MODE — open a non-LLM custom UI stepper (asset picker →
 *      amount → confirm).
 *
 * Flow mode competed with the agent stack — we built 14 guards + 12
 * preflights + USD-aware permissions + the 5-system Audric Intelligence
 * platform precisely so the agent can handle `"save 10 USDC"`
 * reliably. The form-first bypass-the-agent path no longer earns its
 * complexity (~1,800 LoC across save/send/swap/borrow/repay flow
 * steppers + chip-expand drawers + custom modals).
 *
 * See `spec/runbooks/RUNBOOK_v07c_phase_6_cutover.md` §4.7.F and the
 * "CHIP_REVIEW_3" entry in `audric-build-tracker.md` for the full
 * rationale. Future agents: do NOT re-port the flow steppers. The chip
 * tap → composer-fill → user-confirms-with-Enter loop IS the
 * canonical path.
 */

export interface ChipConfig {
  id: string;
  label: string;
  prompt: string;
}

/**
 * Seven chips, visible at all times below the composer. Order matches
 * the runbook: Audric Finance verbs first (Save / Send / Swap /
 * Credit), then Audric Pay (Receive), then orchestration (Harvest),
 * then read-only (Charts).
 *
 * Each `prompt` is the literal sentence the agent receives if the user
 * hits Enter without editing — written as a natural request so the
 * agent's tool-selection logic does the rest. The agent picks USDC vs
 * USDsui via balance context (the `<financial_context>` block), asks
 * for the amount when ambiguous, and surfaces a confirm card for any
 * write above the user's permission threshold.
 */
export const CHIP_CONFIGS: readonly ChipConfig[] = [
  { id: "save", label: "Save", prompt: "Save USDC into NAVI savings" },
  { id: "send", label: "Send", prompt: "Send USDC to someone" },
  { id: "swap", label: "Swap", prompt: "Swap one token for another" },
  { id: "credit", label: "Credit", prompt: "Borrow USDC against my savings" },
  {
    id: "receive",
    label: "Receive",
    prompt: "Show my wallet address and a QR code so someone can pay me",
  },
  {
    id: "harvest",
    label: "Harvest",
    prompt:
      "Show what NAVI rewards I can harvest, then bundle them into savings",
  },
  { id: "charts", label: "Charts", prompt: "Show my full portfolio" },
] as const;
