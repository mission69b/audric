export interface ChipAction {
  label: string;
  sublabel: string;
  prompt: string;
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
    {
      id: 'save',
      label: 'Save',
      actions: [
        {
          label: 'Save $50 USDC',
          sublabel: `deposit into NAVI at ${apyStr} APY`,
          prompt: 'Save $50 USDC into savings',
        },
        ...(idleUsdc > 1
          ? [
              {
                label: `Save all idle USDC`,
                sublabel: `$${Math.floor(idleUsdc)} sitting in wallet`,
                prompt: 'Save all my idle USDC',
              },
            ]
          : []),
        {
          label: 'Automate weekly saves',
          sublabel: 'every Friday at 9am',
          prompt: 'Set up automatic weekly savings of $50 every Friday',
        },
        {
          label: 'Check savings rate',
          sublabel: 'live NAVI APY',
          prompt: 'What is my current savings APY?',
        },
      ],
    },
    {
      id: 'send',
      label: 'Send',
      actions: [
        { label: 'Send to contact', sublabel: 'from your saved contacts', prompt: 'Send $10 USDC to a contact' },
        { label: 'Send to address', sublabel: 'paste any Sui wallet', prompt: 'Send USDC to a Sui address' },
        { label: 'Create payment link', sublabel: 'share to receive USDC', prompt: 'Create a payment link for $50' },
      ],
    },
    {
      id: 'swap',
      label: 'Swap',
      actions: [
        { label: 'SUI → USDC', sublabel: 'Cetus quote preview', prompt: 'Swap 10 SUI to USDC and show me the quote first' },
        { label: 'Best rates now', sublabel: 'live market prices', prompt: 'What are the best swap rates right now?' },
        { label: 'Swap all SUI', sublabel: 'see quote, then confirm', prompt: 'Swap all my SUI to USDC' },
      ],
    },
    {
      id: 'borrow',
      label: 'Credit',
      actions: [
        { label: 'Health factor check', sublabel: 'liquidation risk analysis', prompt: 'What is my health factor and am I at risk of liquidation?' },
        { label: 'Borrow $50 USDC', sublabel: 'against your savings', prompt: 'Borrow $50 USDC' },
        { label: 'Repay debt', sublabel: 'reduce liquidation risk', prompt: 'Repay all my debt' },
      ],
    },
    {
      id: 'receive',
      label: 'Receive',
      actions: [
        { label: 'Show wallet address', sublabel: 'copy or share QR', prompt: 'Show me my wallet address and QR code for receiving USDC' },
        { label: 'Create payment link', sublabel: 'let others pay you', prompt: 'Create a payment link for $25 USDC' },
      ],
    },
    {
      id: 'charts',
      label: 'Charts',
      actions: [
        { label: 'Full portfolio', sublabel: '4-panel financial overview', prompt: 'Show me my full portfolio canvas' },
        { label: 'Activity heatmap', sublabel: 'transaction history grid', prompt: 'Show my activity heatmap' },
        { label: 'Yield projector', sublabel: 'simulate future earnings', prompt: 'Show my yield projector' },
        { label: 'Portfolio timeline', sublabel: 'net worth over time', prompt: 'Show my portfolio timeline for the last 90 days' },
      ],
    },
  ];
}
