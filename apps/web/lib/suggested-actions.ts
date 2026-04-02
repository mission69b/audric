import type { ToolExecution } from '@/lib/engine-types';

export interface SuggestedActionItem {
  icon: string;
  label: string;
  prompt: string;
}

const TOOL_FOLLOWUPS: Record<string, SuggestedActionItem[]> = {
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
  save_deposit: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '📈', label: 'VIEW RATES', prompt: 'What rate am I earning?' },
  ],
  withdraw: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '🔄', label: 'SEND USDC', prompt: 'Send USDC to a friend' },
  ],
  send_transfer: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '🏦', label: 'SAVE REMAINDER', prompt: 'Save my remaining USDC' },
  ],
  borrow: [
    { icon: '🛡️', label: 'HEALTH CHECK', prompt: 'Check my account health' },
    { icon: '💳', label: 'REPAY DEBT', prompt: 'Repay my debt' },
  ],
  repay_debt: [
    { icon: '🛡️', label: 'HEALTH CHECK', prompt: 'Check my account health' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
  claim_rewards: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '🏦', label: 'SAVE REWARDS', prompt: 'Save my claimed rewards' },
  ],
  transaction_history: [
    { icon: '📊', label: 'FULL REPORT', prompt: 'Give me a full account report' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
  pay_api: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '⚡', label: 'USE ANOTHER API', prompt: 'What APIs can I use?' },
  ],
};

const DEFAULT_ACTIONS: SuggestedActionItem[] = [
  { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  { icon: '🏦', label: 'SAVE USDC', prompt: 'Save $100' },
  { icon: '🔄', label: 'SEND USDC', prompt: 'Send $50 to a friend' },
];

export function deriveSuggestedActions(tools?: ToolExecution[]): SuggestedActionItem[] {
  if (!tools || tools.length === 0) return DEFAULT_ACTIONS.slice(0, 2);

  const lastDoneTool = [...tools].reverse().find((t) => t.status === 'done');
  if (!lastDoneTool) return DEFAULT_ACTIONS.slice(0, 2);

  return TOOL_FOLLOWUPS[lastDoneTool.toolName] ?? DEFAULT_ACTIONS.slice(0, 2);
}
