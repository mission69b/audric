import type { ToolExecution } from '@/lib/engine-types';

export interface SuggestedActionItem {
  icon: string;
  label: string;
  prompt: string;
}

/**
 * Best-effort shape for tool result `data` consumed by ChipBuilders.
 * Every field is optional — extractResultData returns `{}` if the tool
 * didn't include a `data` envelope or the field is missing. Builders
 * MUST handle the missing-field case so a malformed tool response never
 * crashes the chip row.
 *
 * Field origins:
 * - `toToken`           — `swap_execute` (input echoed in result)
 * - `direction`/`query`/`address`/`primary` — `resolve_suins`
 * - `url`/`label`/`slug` — `create_payment_link` / `create_invoice`
 * - `name`              — `save_contact`
 */
interface ToolResultData {
  toToken?: string;
  direction?: 'forward' | 'reverse';
  query?: string;
  address?: string | null;
  primary?: string | null;
  url?: string;
  label?: string | null;
  slug?: string;
  name?: string;
}

type ChipBuilder = (data: ToolResultData) => SuggestedActionItem[];

const TOOL_CHIPS: Record<string, SuggestedActionItem[] | ChipBuilder> = {
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
  save_deposit: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '📈', label: 'VIEW RATES', prompt: 'What rate am I earning?' },
  ],
  withdraw: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '🏦', label: 'SAVE USDC', prompt: 'Save my USDC' },
  ],
  send_transfer: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '🏦', label: 'SAVE REMAINDER', prompt: 'Save my remaining USDC' },
  ],
  swap_execute: (data) => {
    const token = (data.toToken ?? 'tokens').toUpperCase();
    return [
      { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
      { icon: '🏦', label: `DEPOSIT ${token}`, prompt: `Deposit my ${data.toToken ?? 'tokens'} into NAVI lending` },
    ];
  },
  volo_stake: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '📊', label: 'MY SAVINGS', prompt: 'Show my savings positions' },
  ],
  volo_unstake: [
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
    { icon: '🏦', label: 'SAVE SUI', prompt: 'Deposit my SUI into NAVI lending' },
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
  // ── CHIP_REVIEW_2 F-4 / F-5 backfill (2026-05-07) ─────────────────
  // Audric Passport (SPEC 10) — resolved a SuiNS handle to an address (or vice versa).
  // The natural follow-ups are: send to that user, save them as a contact.
  resolve_suins: (data) => {
    const handle = data.direction === 'forward' ? data.query : data.primary;
    if (handle) {
      return [
        { icon: '💸', label: 'SEND TO THIS USER', prompt: `Send USDC to ${handle}` },
        { icon: '💾', label: 'SAVE AS CONTACT', prompt: `Save ${handle} as a contact` },
      ];
    }
    // Reverse with no .sui name OR forward with no resolved address — offer
    // a generic "look up another" handoff rather than a misleading send chip.
    return [
      { icon: '🔍', label: 'LOOK UP ANOTHER', prompt: 'Resolve another SuiNS name or address' },
      { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
    ];
  },
  // Audric Pay — payment links / invoices. Post-create, COPY LINK and SHARE
  // are the two universal next actions. Cancel + list flows offer their
  // counterparts so the user can stay in the receive-money mental loop.
  create_payment_link: (data) => {
    const url = data.url;
    return [
      { icon: '📋', label: 'COPY LINK', prompt: url ? `Copy this payment link: ${url}` : 'Copy the payment link to my clipboard' },
      { icon: '📤', label: 'SHARE LINK', prompt: url ? `Share this payment link: ${url}` : 'Share the payment link' },
    ];
  },
  create_invoice: (data) => {
    const url = data.url;
    return [
      { icon: '📋', label: 'COPY INVOICE', prompt: url ? `Copy this invoice URL: ${url}` : 'Copy the invoice URL to my clipboard' },
      { icon: '📤', label: 'SHARE INVOICE', prompt: url ? `Share this invoice: ${url}` : 'Share the invoice' },
    ];
  },
  list_payment_links: [
    { icon: '➕', label: 'NEW LINK', prompt: 'Create a new payment link' },
    { icon: '📑', label: 'INVOICES', prompt: 'Show my invoices too' },
  ],
  list_invoices: [
    { icon: '➕', label: 'NEW INVOICE', prompt: 'Create a new invoice' },
    { icon: '🔗', label: 'PAYMENT LINKS', prompt: 'Show my payment links too' },
  ],
  cancel_payment_link: [
    { icon: '🔗', label: 'REMAINING LINKS', prompt: 'Show my remaining payment links' },
    { icon: '➕', label: 'NEW LINK', prompt: 'Create a new payment link' },
  ],
  cancel_invoice: [
    { icon: '📑', label: 'REMAINING INVOICES', prompt: 'Show my remaining invoices' },
    { icon: '➕', label: 'NEW INVOICE', prompt: 'Create a new invoice' },
  ],
  // Contacts — after saving, the natural next move is to send to them. After
  // listing isn't a tool yet (no list_contacts in the engine); skip.
  save_contact: (data) => {
    const name = data.name;
    return [
      { icon: '💸', label: name ? `SEND TO ${name.toUpperCase()}` : 'SEND TO THIS CONTACT', prompt: name ? `Send USDC to ${name}` : 'Send USDC to my contact' },
      { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
    ];
  },
  // Read-only research tools — no canonical "next move", so offer a tight
  // pair of relevant follow-ups instead of leaving DEFAULT_ACTIONS to fire.
  mpp_services: [
    { icon: '⚡', label: 'USE A SERVICE', prompt: 'Pick a service from the list and use it' },
    { icon: '🔍', label: 'SEARCH SERVICES', prompt: 'Search MPP for a different service' },
  ],
  web_search: [
    { icon: '🔄', label: 'REFINE SEARCH', prompt: 'Search for something more specific' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
  explain_tx: [
    { icon: '📜', label: 'TX HISTORY', prompt: 'Show my recent transaction history' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance now?' },
  ],
  portfolio_analysis: [
    { icon: '🏦', label: 'ACT ON THIS', prompt: 'Recommend the best action based on this analysis' },
    { icon: '📊', label: 'FULL PORTFOLIO', prompt: 'Show my full portfolio' },
  ],
  protocol_deep_dive: [
    { icon: '🏦', label: 'SAVE INTO IT', prompt: 'Save USDC into this protocol' },
    { icon: '📈', label: 'COMPARE RATES', prompt: 'Compare rates across protocols' },
  ],
  token_prices: [
    { icon: '🔄', label: 'SWAP NOW', prompt: 'Swap tokens at current prices' },
    { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  ],
  volo_stats: [
    { icon: '🥩', label: 'STAKE SUI', prompt: 'Stake my SUI with Volo' },
    { icon: '🏦', label: 'COMPARE TO NAVI', prompt: 'Compare Volo vs NAVI for my SUI' },
  ],
};

const DEFAULT_ACTIONS: SuggestedActionItem[] = [
  { icon: '💰', label: 'CHECK BALANCE', prompt: 'What is my balance?' },
  { icon: '🏦', label: 'SAVE USDC', prompt: 'Save $100' },
];

function extractResultData(tool: ToolExecution): ToolResultData {
  const result = tool.result;
  if (!result || typeof result !== 'object') return {};
  const raw = 'data' in result ? (result as { data: unknown }).data : result;
  if (!raw || typeof raw !== 'object') return {};
  return raw as ToolResultData;
}

export function deriveSuggestedActions(tools?: ToolExecution[]): SuggestedActionItem[] {
  if (!tools || tools.length === 0) return DEFAULT_ACTIONS;

  const lastDoneTool = [...tools].reverse().find((t) => t.status === 'done');
  if (!lastDoneTool) return DEFAULT_ACTIONS;

  const chips = TOOL_CHIPS[lastDoneTool.toolName];
  if (!chips) return DEFAULT_ACTIONS;

  return typeof chips === 'function' ? chips(extractResultData(lastDoneTool)) : chips;
}

/**
 * [F15 / 2026-05-03] True when the assistant's last text ends with a
 * question — surface call-site uses this to suppress action chips while
 * the agent is awaiting an answer (e.g. "Confirm to proceed?").
 *
 * Repro: a 6-op compound flow had the LLM emit Turn 1 = reads + plan
 * ending in "Confirm to proceed?" with no `pending_action` yet (the
 * engine waits for the user's "yes" before emitting the writes). The
 * chip system saw the last successful tool (`swap_quote`) and rendered
 * "EXECUTE SWAP" / "Execute the swap". The user tapped it expecting
 * plan execution; the LLM treated it as a fresh swap request and asked
 * "which swap?" because there were 2 in the plan. The fix: hide chips
 * when the agent's tail is a question — yes/no/clarification belongs in
 * the input, not in a generic chip.
 *
 * Heuristic: literal trailing `?` after stripping common markdown punct
 * that may follow it (`*`, `_`, backtick, closing quote/paren). Avoids
 * false negatives on `**Confirm to proceed?**` and similar.
 */
const TRAILING_QUESTION_REGEX = /\?[*_`)\]'"\s]*$/;

export function endsWithQuestion(text: string | undefined | null): boolean {
  if (!text) return false;
  const trimmed = text.trimEnd();
  if (!trimmed) return false;
  return TRAILING_QUESTION_REGEX.test(trimmed);
}
