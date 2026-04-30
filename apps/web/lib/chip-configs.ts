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
  currentApy: number;
}

export function buildChipConfigs(prefetch?: ChipPrefetchData): ChipConfig[] {
  const idleUsdc = prefetch?.idleUsdc ?? 0;
  const currentApy = prefetch?.currentApy ?? 0;
  const apyStr = currentApy > 0 ? `${(currentApy * 100).toFixed(1)}%` : '~5%';

  return [
    // ── Audric Finance ────────────────────────────────────────
    {
      id: 'save',
      label: 'Save',
      actions: [
        {
          label: idleUsdc > 1 ? `Save all $${Math.floor(idleUsdc)} USDC` : 'Save USDC',
          sublabel: idleUsdc > 1 ? 'idle balance → NAVI' : 'pick amount → confirm → done',
          prompt: idleUsdc > 1 ? 'Save all my idle USDC' : 'Save USDC into savings',
          flow: idleUsdc > 1 ? 'save-all' : 'save',
        },
        {
          label: 'Check savings rate',
          sublabel: `live NAVI APY · ${apyStr}`,
          prompt: 'What is my current savings APY?',
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
        { label: 'Best rates now', sublabel: 'live market prices', prompt: 'What are the best swap rates right now?' },
        { label: 'Swap all SUI', sublabel: 'see quote, then confirm', prompt: 'Swap all my SUI to USDC' },
      ],
    },
    {
      id: 'borrow',
      label: 'Credit',
      actions: [
        { label: 'Borrow USDC', sublabel: 'pick amount → confirm', prompt: 'Borrow USDC', flow: 'borrow' },
        { label: 'Repay debt', sublabel: 'reduce liquidation risk', prompt: 'Repay all my debt', flow: 'repay' },
        { label: 'Health factor check', sublabel: 'liquidation risk analysis', prompt: 'What is my health factor and am I at risk of liquidation?' },
      ],
    },
    {
      id: 'charts',
      label: 'Charts',
      actions: [
        { label: 'Full portfolio', sublabel: '4-panel financial overview', prompt: 'Show me my full portfolio canvas' },
        { label: 'Activity heatmap', sublabel: 'transaction history grid', prompt: 'Show my activity heatmap' },
        { label: 'Yield projector', sublabel: 'simulate future earnings', prompt: 'Show my yield projector' },
      ],
    },
    // ── Audric Pay ────────────────────────────────────────────
    {
      id: 'send',
      label: 'Send',
      actions: [
        { label: 'Send USDC', sublabel: 'pick contact → amount → confirm', prompt: 'Send USDC', flow: 'send' },
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
