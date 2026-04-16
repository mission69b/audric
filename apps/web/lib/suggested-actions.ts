import type { ToolExecution } from '@/lib/engine-types';

export interface SuggestedActionItem {
  icon: string;
  label: string;
  prompt: string;
}

interface ToolResultData {
  tx?: string;
  asset?: string;
  toToken?: string;
  fromToken?: string;
  amount?: number;
  toAmount?: number;
}

function extractResultData(tool: ToolExecution): ToolResultData {
  const result = tool.result;
  if (!result || typeof result !== 'object') return {};
  const raw = 'data' in result ? (result as { data: unknown }).data : result;
  if (!raw || typeof raw !== 'object') return {};
  return raw as ToolResultData;
}

const STATIC_FOLLOWUPS: Record<string, SuggestedActionItem[]> = {
  balance_check: [
    { icon: '🏦', label: 'SAVE IDLE USDC', prompt: 'Save my idle USDC' },
    { icon: '📈', label: 'CHECK RATES', prompt: 'What are the current rates?' },
  ],
  savings_info: [
    { icon: '📤', label: 'WITHDRAW', prompt: 'Withdraw my savings' },
    { icon: '📈', label: 'CHECK RATES', prompt: 'What rates am I earning?' },
  ],
  rates_info: [
    { icon: '🏦', label: 'SAVE NOW', prompt: 'Save $100' },
    { icon: '📊', label: 'MY SAVINGS', prompt: 'Show my savings details' },
  ],
  health_check: [
    { icon: '💳', label: 'REPAY DEBT', prompt: 'Repay my debt' },
    { icon: '📊', label: 'FULL REPORT', prompt: 'Give me a full account report' },
  ],
  transaction_history: [
    { icon: '📊', label: 'FULL REPORT', prompt: 'Give me a full account report' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
  pay_api: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '⚡', label: 'USE ANOTHER API', prompt: 'What APIs can I use?' },
  ],
  render_canvas: [
    { icon: '📊', label: 'ACTIVITY HEATMAP', prompt: 'Show my activity heatmap' },
    { icon: '📈', label: 'YIELD PROJECTOR', prompt: 'Show me the yield projector' },
    { icon: '🛡️', label: 'HEALTH SIMULATOR', prompt: 'Open the health factor simulator' },
  ],
  spending_analytics: [
    { icon: '📊', label: 'SPENDING BREAKDOWN', prompt: 'Show my spending breakdown as a chart' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
  yield_summary: [
    { icon: '🏦', label: 'SAVE MORE', prompt: 'Save more USDC' },
    { icon: '📈', label: 'YIELD PROJECTOR', prompt: 'Show the yield projector' },
  ],
  activity_summary: [
    { icon: '📊', label: 'FULL HEATMAP', prompt: 'Show my activity heatmap' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
  swap_quote: [
    { icon: '🔄', label: 'EXECUTE SWAP', prompt: 'Execute the swap' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
  pattern_status: [
    { icon: '📅', label: 'MY SCHEDULES', prompt: 'Show my automations' },
    { icon: '📊', label: 'FULL REPORT', prompt: 'Give me a full account report' },
  ],
  list_schedules: [
    { icon: '📅', label: 'CREATE SCHEDULE', prompt: 'Create a new savings schedule' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
};

function deriveWriteToolChips(toolName: string, data: ToolResultData): SuggestedActionItem[] {
  switch (toolName) {
    case 'save_deposit':
      return [
        { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
        { icon: '📈', label: 'VIEW RATES', prompt: 'What rate am I earning?' },
      ];
    case 'withdraw':
      return [
        { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
        { icon: '🏦', label: 'SAVE USDC', prompt: 'Save my USDC' },
      ];
    case 'send_transfer':
      return [
        { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
        { icon: '🏦', label: 'SAVE REMAINDER', prompt: 'Save my remaining USDC' },
      ];
    case 'swap_execute': {
      const token = data.toToken ?? 'tokens';
      return [
        { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
        { icon: '🏦', label: `DEPOSIT ${token.toUpperCase()}`, prompt: `Deposit my ${token} into NAVI lending` },
      ];
    }
    case 'volo_stake':
      return [
        { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
        { icon: '📊', label: 'MY SAVINGS', prompt: 'Show my savings positions' },
      ];
    case 'volo_unstake':
      return [
        { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
        { icon: '🏦', label: 'SAVE SUI', prompt: 'Deposit my SUI into NAVI lending' },
      ];
    case 'borrow':
      return [
        { icon: '🛡️', label: 'HEALTH CHECK', prompt: 'Check my account health' },
        { icon: '💳', label: 'REPAY DEBT', prompt: 'Repay my debt' },
      ];
    case 'repay_debt':
      return [
        { icon: '🛡️', label: 'HEALTH CHECK', prompt: 'Check my account health' },
        { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
      ];
    case 'claim_rewards':
      return [
        { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
        { icon: '🏦', label: 'SAVE REWARDS', prompt: 'Save my claimed rewards' },
      ];
    default:
      return [];
  }
}

const DEFAULT_ACTIONS: SuggestedActionItem[] = [
  { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  { icon: '🏦', label: 'SAVE USDC', prompt: 'Save $100' },
];

export function deriveSuggestedActions(tools?: ToolExecution[]): SuggestedActionItem[] {
  if (!tools || tools.length === 0) return DEFAULT_ACTIONS;

  const lastDoneTool = [...tools].reverse().find((t) => t.status === 'done');
  if (!lastDoneTool) return DEFAULT_ACTIONS;

  const staticChips = STATIC_FOLLOWUPS[lastDoneTool.toolName];
  if (staticChips) return staticChips;

  const data = extractResultData(lastDoneTool);
  const writeChips = deriveWriteToolChips(lastDoneTool.toolName, data);
  if (writeChips.length > 0) return writeChips;

  return DEFAULT_ACTIONS;
}
