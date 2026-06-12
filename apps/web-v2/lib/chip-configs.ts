/**
 * Chip configurations — Audric's six quick-prompt entry points.
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
 * [SPEC_AUDRIC_DEFI_REMOVAL §2a/§2c — 2026-06-10] The DeFi chips
 * (Save / Swap / Credit / Harvest / Charts) were cut with the
 * window-start removal — chips are open-new-position affordances and
 * the products behind them are retired (§2c also bans a user-facing
 * Swap verb/chip outright). Only "Send" survives.
 *
 * The Services chip row (Research · Create · Pay · Audric's choice —
 * S.372 taxonomy) ships with the composer-as-homepage work in
 * `SPEC_AUDRIC_MPP_REENABLE.md`; the final chip set is locked there,
 * not here.
 *
 * [L4 — 2026-05-31] The "Receive" chip was removed — the Add-funds
 * button in the chat shell now owns the receive / show-my-address flow,
 * so a Receive chip duplicated it.
 *
 * Each `prompt` is the literal sentence the agent receives if the user
 * hits Enter without editing — written as a natural request so the
 * agent's tool-selection logic does the rest. The agent asks for the
 * amount when ambiguous and surfaces a confirm card for every write.
 */
export const CHIP_CONFIGS: readonly ChipConfig[] = [
  { id: "send", label: "Send", prompt: "Send USDC to someone" },
] as const;
