/**
 * Client-side mirror of the engine's permission-tier resolution.
 *
 * The engine package (`@t2000/engine`) exports `resolvePermissionTier`,
 * `resolveUsdValue`, `toolNameToOperation`, and `PERMISSION_PRESETS`, but
 * the engine barrel pulls in Node-only deps (`fs`, MCP, etc.) that can't
 * resolve in a client bundle — see the same workaround in
 * `components/settings/SafetySection.tsx`.
 *
 * SOURCE OF TRUTH for runtime gating remains the engine. These constants
 * MUST match `packages/engine/src/permission-rules.ts` exactly. If the
 * engine ever rebalances the presets, refresh the values below.
 *
 * Usage: `<UnifiedTimeline>` and `<ChatMessage>` consult
 * `shouldClientAutoApprove(action, ...)` to decide whether to render
 * the `<PermissionCard>` or auto-resolve a pending action.
 */
import type { PendingAction } from '@/lib/engine-types';

export type PermissionOperation =
  | 'save'
  | 'withdraw'
  | 'send'
  | 'borrow'
  | 'repay'
  | 'swap'
  | 'pay';

export interface PermissionRule {
  operation: PermissionOperation;
  autoBelow: number;
  confirmBetween: number;
}

export interface UserPermissionConfig {
  rules: PermissionRule[];
  globalAutoBelow: number;
  autonomousDailyLimit: number;
}

export type PermissionPreset = 'conservative' | 'balanced' | 'aggressive';

const CONSERVATIVE: UserPermissionConfig = {
  globalAutoBelow: 5,
  autonomousDailyLimit: 100,
  rules: [
    { operation: 'save', autoBelow: 5, confirmBetween: 100 },
    { operation: 'send', autoBelow: 5, confirmBetween: 100 },
    { operation: 'borrow', autoBelow: 0, confirmBetween: 100 },
    { operation: 'withdraw', autoBelow: 5, confirmBetween: 100 },
    { operation: 'swap', autoBelow: 5, confirmBetween: 100 },
    { operation: 'pay', autoBelow: 1, confirmBetween: 25 },
    { operation: 'repay', autoBelow: 5, confirmBetween: 100 },
  ],
};

const BALANCED: UserPermissionConfig = {
  globalAutoBelow: 10,
  autonomousDailyLimit: 200,
  rules: [
    { operation: 'save', autoBelow: 50, confirmBetween: 1000 },
    { operation: 'send', autoBelow: 10, confirmBetween: 200 },
    { operation: 'borrow', autoBelow: 0, confirmBetween: 500 },
    { operation: 'withdraw', autoBelow: 25, confirmBetween: 500 },
    { operation: 'swap', autoBelow: 25, confirmBetween: 300 },
    { operation: 'pay', autoBelow: 1, confirmBetween: 50 },
    { operation: 'repay', autoBelow: 50, confirmBetween: 1000 },
  ],
};

const AGGRESSIVE: UserPermissionConfig = {
  globalAutoBelow: 25,
  autonomousDailyLimit: 500,
  rules: [
    { operation: 'save', autoBelow: 100, confirmBetween: 2000 },
    { operation: 'send', autoBelow: 25, confirmBetween: 500 },
    { operation: 'borrow', autoBelow: 10, confirmBetween: 1000 },
    { operation: 'withdraw', autoBelow: 50, confirmBetween: 1000 },
    { operation: 'swap', autoBelow: 50, confirmBetween: 500 },
    { operation: 'pay', autoBelow: 5, confirmBetween: 100 },
    { operation: 'repay', autoBelow: 100, confirmBetween: 2000 },
  ],
};

export const PERMISSION_PRESETS: Record<PermissionPreset, UserPermissionConfig> = {
  conservative: CONSERVATIVE,
  balanced: BALANCED,
  aggressive: AGGRESSIVE,
};

export const DEFAULT_PERMISSION_CONFIG = BALANCED;

export function getPresetConfig(preset: PermissionPreset | undefined | null): UserPermissionConfig {
  if (preset && preset in PERMISSION_PRESETS) return PERMISSION_PRESETS[preset];
  return DEFAULT_PERMISSION_CONFIG;
}

const TOOL_TO_OPERATION: Record<string, PermissionOperation> = {
  save_deposit: 'save',
  withdraw: 'withdraw',
  send_transfer: 'send',
  borrow: 'borrow',
  repay_debt: 'repay',
  swap_execute: 'swap',
  pay_api: 'pay',
  volo_stake: 'save',
  volo_unstake: 'withdraw',
};

export function toolNameToOperation(toolName: string): PermissionOperation | undefined {
  return TOOL_TO_OPERATION[toolName];
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Resolve the USD value of a tool call from its inputs. Mirrors the
 * engine helper of the same name. USDC/USDT are 1:1; other assets need a
 * `priceCache` (uppercased symbol → USD/unit). When the symbol is
 * missing from the cache we return `Infinity` so the tier resolver
 * upgrades the action out of the `auto` band — failing safe.
 */
export function resolveUsdValue(
  toolName: string,
  input: Record<string, unknown>,
  priceCache: Map<string, number>,
): number {
  switch (toolName) {
    case 'save_deposit':
    case 'withdraw':
    case 'repay_debt':
    case 'borrow':
      return safeNum(input.amount);

    case 'send_transfer': {
      const amount = safeNum(input.amount);
      const asset = String(input.asset ?? 'USDC').toUpperCase();
      if (asset === 'USDC' || asset === 'USDT') return amount;
      const px = priceCache.get(asset);
      return px === undefined ? Infinity : amount * px;
    }

    case 'swap_execute': {
      const amount = safeNum(input.fromAmount ?? input.amount);
      const fromAsset = String(input.fromAsset ?? input.from ?? '').toUpperCase();
      if (fromAsset === 'USDC' || fromAsset === 'USDT') return amount;
      const px = priceCache.get(fromAsset);
      return px === undefined ? Infinity : amount * px;
    }

    case 'pay_api':
      return safeNum(input.maxCost ?? input.price);

    case 'volo_stake':
    case 'volo_unstake': {
      const amount = safeNum(input.amount);
      const px = priceCache.get('SUI');
      return px === undefined ? Infinity : amount * px;
    }

    default:
      return 0;
  }
}

/**
 * True when `to` matches a saved contact's address (case-insensitive,
 * normalized). Mirror of `isKnownContactAddress` in
 * `packages/engine/src/permission-rules.ts` — keep in sync.
 */
export function isKnownContactAddress(
  to: string,
  contacts: ReadonlyArray<{ address: string }>,
): boolean {
  if (!to) return false;
  const normalized = to.trim().toLowerCase();
  return contacts.some((c) => c.address.trim().toLowerCase() === normalized);
}

/**
 * Mirror of the engine resolver. When `sessionSpendUsd` is supplied and
 * adding the incoming `amountUsd` would push cumulative spend over
 * `config.autonomousDailyLimit`, an otherwise-`auto` tier is downgraded
 * to `confirm` (the v1.4 daily cap).
 *
 * Send-safety rule (mirror of engine): `send_transfer` to a raw `0x`
 * recipient with NO matching saved contact always confirms, regardless
 * of amount/preset. Bounds the "typo silently ships funds" failure
 * mode to one confirmation per recipient — once saved as a contact,
 * subsequent sends auto-approve under tier as normal.
 */
export function resolvePermissionTier(
  operation: string,
  amountUsd: number,
  config: UserPermissionConfig,
  sessionSpendUsd?: number,
  sendContext?: {
    to?: string;
    contacts?: ReadonlyArray<{ address: string }>;
  },
): 'auto' | 'confirm' | 'explicit' {
  const rule = config.rules.find((r) => r.operation === operation);
  const autoBelow = rule?.autoBelow ?? config.globalAutoBelow;
  const confirmBetween = rule?.confirmBetween ?? 1000;

  let tier: 'auto' | 'confirm' | 'explicit';
  if (amountUsd < autoBelow) tier = 'auto';
  else if (amountUsd < confirmBetween) tier = 'confirm';
  else tier = 'explicit';

  if (
    tier === 'auto' &&
    typeof sessionSpendUsd === 'number' &&
    sessionSpendUsd + amountUsd > config.autonomousDailyLimit
  ) {
    tier = 'confirm';
  }

  if (
    tier === 'auto' &&
    operation === 'send' &&
    sendContext?.to &&
    !isKnownContactAddress(sendContext.to, sendContext.contacts ?? [])
  ) {
    tier = 'confirm';
  }

  return tier;
}

/**
 * Tools without a financial-value mapping (e.g. `claim_rewards`,
 * `save_contact`). Treated as auto-approve client-side because they
 * carry no spendable USD value — the engine still validates them.
 */
const NON_FINANCIAL_AUTO_APPROVE = new Set(['claim_rewards', 'save_contact']);

/**
 * The single client-side gate. Returns true when the pending action
 * should be auto-resolved without rendering a `<PermissionCard>`.
 *
 * Resolution order:
 *   1. Non-financial writes (rewards, contacts) — always auto.
 *   2. Send-safety: a raw 0x recipient with no contact match always
 *      shows the card so the user can verify the address. The
 *      `agentBudget` fast path does NOT bypass this — the whole point
 *      is that "address came from the LLM" is the dangerous case the
 *      user must eyeball. Bypassing for "small amounts" is the exact
 *      regression we're closing (the lost-funds incident was $13.53).
 *   3. `agentBudget` fast path — explicit per-session ceiling that the
 *      user set in the dashboard. Independent of the safety preset.
 *   4. Tier resolver against the user's preset, with `sessionSpendUsd`
 *      enforcing the daily autonomous cap and the contact-aware send
 *      rule.
 */
export function shouldClientAutoApprove(
  action: Pick<PendingAction, 'toolName' | 'input'>,
  config: UserPermissionConfig,
  sessionSpendUsd: number,
  priceCache: Map<string, number>,
  agentBudget = 0,
  contacts: ReadonlyArray<{ address: string }> = [],
): boolean {
  if (NON_FINANCIAL_AUTO_APPROVE.has(action.toolName)) return true;

  const operation = toolNameToOperation(action.toolName);
  if (!operation) return false;

  const usdValue = resolveUsdValue(
    action.toolName,
    (action.input as Record<string, unknown>) ?? {},
    priceCache,
  );

  if (operation === 'send') {
    const to = String((action.input as Record<string, unknown>)?.to ?? '');
    if (to.startsWith('0x') && !isKnownContactAddress(to, contacts)) {
      return false;
    }
  }

  if (agentBudget > 0 && Number.isFinite(usdValue) && usdValue <= agentBudget) {
    return true;
  }

  const sendContext =
    operation === 'send'
      ? {
          to: String((action.input as Record<string, unknown>)?.to ?? ''),
          contacts,
        }
      : undefined;
  const tier = resolvePermissionTier(operation, usdValue, config, sessionSpendUsd, sendContext);
  return tier === 'auto';
}
