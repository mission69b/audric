export interface ChipAction {
  label: string;
  sublabel: string;
  prompt: string;
  /** When set, triggers the direct chip flow (bypasses LLM) instead of sending the prompt. */
  flow?: string;
}

export interface ChipConfig {
  id: string;
  label: string;
  actions: ChipAction[];
}

export interface ChipPrefetchData {
  idleUsdc: number;
  /**
   * [CHIP_REVIEW_2 FU-1+FU-3 / 2026-05-07] Idle USDsui balance (saveable per
   * the v0.51 strategic exception). Drives the SAVE chip's L2 first action:
   * when BOTH USDC + USDsui are idle, the auto-action becomes "Save my
   * stables" → flow: 'save' (no preselected asset → the L1.5 picker shows).
   * When only one stable is idle, the chip auto-execs that one. Without
   * this field the picker infrastructure (F-2 work) is unreachable from
   * the chip-bar.
   */
  idleUsdsui?: number;
  currentApy: number;
}

export function buildChipConfigs(prefetch?: ChipPrefetchData): ChipConfig[] {
  const idleUsdc = prefetch?.idleUsdc ?? 0;
  const idleUsdsui = prefetch?.idleUsdsui ?? 0;
  // [Track B / 2026-05-08] `currentApy` was used by the now-removed
  // "Check savings rate" chip. Field stays on `ChipPrefetchData` for
  // backward compat with callers (dashboard, NewConversationView,
  // engine-context, etc.) and as a slot for any future APY-aware chip.

  // [CHIP_REVIEW_2 FU-1+FU-3 / 2026-05-07] Save auto-action picker. Three cases:
  // (1) Both stables idle (>$1 each) → "Save my stables ($total)" routes to
  //     flow: 'save' WITHOUT a preselected asset; the dashboard's L1.5
  //     picker auto-skip effect renders the USDC-vs-USDsui picker because
  //     `getSaveableAssets()` returns length===2. User taps to pick.
  // (2) Only USDC idle → keep the original `save-all` auto-execute (USDC).
  // (3) Only USDsui idle → mirror auto-execute as `save-all-usdsui`.
  // (4) Neither → generic "Save USDC" prompt.
  let saveAction: ChipAction;
  if (idleUsdc > 1 && idleUsdsui > 1) {
    const total = Math.floor(idleUsdc + idleUsdsui);
    saveAction = {
      label: `Save my stables ($${total})`,
      sublabel: `${Math.floor(idleUsdc)} USDC + ${Math.floor(idleUsdsui)} USDsui → pick which`,
      prompt: 'Save my idle stables',
      flow: 'save',
    };
  } else if (idleUsdc > 1) {
    saveAction = {
      label: `Save all $${Math.floor(idleUsdc)} USDC`,
      sublabel: 'idle balance → NAVI',
      prompt: 'Save all my idle USDC',
      flow: 'save-all',
    };
  } else if (idleUsdsui > 1) {
    saveAction = {
      label: `Save all $${Math.floor(idleUsdsui)} USDsui`,
      sublabel: 'idle balance → NAVI',
      prompt: 'Save all my idle USDsui',
      flow: 'save-all-usdsui',
    };
  } else {
    saveAction = {
      label: 'Save',
      sublabel: 'pick stable → amount → confirm',
      prompt: 'Save into NAVI savings',
      flow: 'save',
    };
  }

  return [
    // ── Audric Finance ────────────────────────────────────────
    {
      id: 'save',
      label: 'Save',
      actions: [
        saveAction,
        // [Track B / 2026-05-08] Replaces "Check savings rate" — the APY
        // is already in the dashboard header ("EARNING $X/DAY · Y% APY"),
        // so the chip slot is better spent on a real action than a
        // re-fetch. Harvest is the natural compound move for users with
        // pending rewards: claim → swap each non-USDC reward to USDC →
        // deposit into NAVI savings, all in ONE confirm tap (atomic
        // PTB). When no rewards are pending, the LLM narrates "nothing
        // to harvest" honestly via the prepare route's empty-plan 400.
        // The prompt nudges the LLM to inspect via `pending_rewards`
        // first so the user sees exactly what's claimable BEFORE the
        // confirm card opens.
        {
          label: 'Harvest rewards',
          sublabel: 'claim → swap → save in 1 tap',
          prompt: 'Show what NAVI rewards I can harvest, then bundle them into savings',
        },
        {
          label: 'Withdraw from savings',
          sublabel: 'pick amount → back to wallet',
          prompt: 'Withdraw USDC from my savings',
        },
      ],
    },
    {
      id: 'swap',
      label: 'Swap',
      actions: [
        { label: 'Swap tokens', sublabel: 'pick pair → amount → confirm', prompt: 'Swap tokens', flow: 'swap' },
        { label: 'Best rates now', sublabel: 'live market prices', prompt: 'What are the best swap rates between USDC, SUI, and USDsui right now?' },
        { label: 'Swap all SUI', sublabel: 'see quote, then confirm', prompt: 'Swap all my SUI to USDC' },
      ],
    },
    {
      id: 'borrow',
      label: 'Credit',
      actions: [
        // [CHIP_REVIEW_2 FU-2 / 2026-05-07] Was "Borrow USDC". The flow already
        // routes through the F-3 L1.5 picker (USDC vs USDsui — both are
        // borrowable stables on NAVI per `usdc-only-saves.mdc` v0.51), so
        // the "USDC" qualifier on the label was misleading. Now matches the
        // Send chip pattern: generic verb + sublabel that names the picker
        // step. Prompt narrowed to just "Borrow" so the flow handler
        // (chipFlow.startFlow with no preselected asset) is the path of
        // truth, not a USDC-biased prompt string.
        { label: 'Borrow', sublabel: 'pick stable → amount → confirm', prompt: 'Borrow', flow: 'borrow' },
        { label: 'Repay debt', sublabel: 'pick amount → wipe debt', prompt: 'Repay all my debt', flow: 'repay' },
        { label: 'Health factor check', sublabel: 'liquidation risk analysis', prompt: 'What is my health factor and am I at risk of liquidation?' },
      ],
    },
    {
      id: 'charts',
      label: 'Charts',
      actions: [
        { label: 'Full portfolio', sublabel: '4-panel financial overview', prompt: 'Show my full portfolio' },
        { label: 'Activity heatmap', sublabel: 'transaction history grid', prompt: 'Show my activity heatmap' },
        { label: 'Yield projector', sublabel: 'simulate future earnings', prompt: 'Show my yield projector' },
      ],
    },
    // ── Audric Pay ────────────────────────────────────────────
    {
      id: 'send',
      label: 'Send',
      actions: [
        // [CHIP_REVIEW_2 F-1 / 2026-05-07] Was "Send USDC". Renamed to "Send"
        // because the chip flow now picks asset (USDC / SUI / USDsui / any
        // held tradeable) via an L1.5 asset picker — auto-skipped silently
        // for USDC-only wallets. The deceptive silent SUI-substitution
        // behavior (when amount > USDC && SUI > 0) was deleted; the user
        // now picks the asset explicitly when they hold more than one.
        { label: 'Send', sublabel: 'pick contact → asset → amount → confirm', prompt: 'Send', flow: 'send' },
        { label: 'Send to address', sublabel: 'paste any Sui wallet', prompt: 'Send USDC to a Sui address' },
        { label: 'Send to a contact', sublabel: 'pick from saved contacts', prompt: 'Send USDC to one of my contacts' },
      ],
    },
    {
      id: 'receive',
      label: 'Receive',
      actions: [
        { label: 'Show wallet address', sublabel: 'copy or share QR', prompt: 'Show me my wallet address and QR code for receiving USDC', flow: 'receive' },
        { label: 'Create payment link', sublabel: 'let others pay you', prompt: 'Create a payment link for $25 USDC' },
        { label: 'Create invoice', sublabel: 'request payment with memo', prompt: 'Create an invoice for $100 USDC' },
      ],
    },
  ];
}
