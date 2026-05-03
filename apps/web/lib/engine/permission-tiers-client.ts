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
    // [F14 / 2026-05-03] Was `autoBelow: 10` — violated the absolute
    // invariant in `t2000/.cursor/rules/safeguards-defense-in-depth.mdc`:
    // "borrow always confirms (autoBelow: 0 across every preset) — debt
    // is too consequential to silently take on." A user on aggressive
    // had a 6-op bundle silently auto-execute because step[0]=`repay $2`
    // resolved auto AND only step[0] was inspected by the gate.
    // Mirrors @t2000/engine 1.11.3+ permission-rules.ts. Engine release
    // notes: F14 — bundle/borrow safety.
    { operation: 'borrow', autoBelow: 0, confirmBetween: 1000 },
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

  // Send-safety: a *raw* 0x recipient that doesn't match a saved
  // contact forces confirm. Contact names (e.g. `to: "wallet1"`) are
  // already trusted — the user explicitly saved that contact — and get
  // resolved to addresses downstream by `effects.resolveContact`.
  // Mirror of `resolvePermissionTier` in
  // `packages/engine/src/permission-rules.ts` — keep in sync.
  if (
    tier === 'auto' &&
    operation === 'send' &&
    sendContext?.to &&
    sendContext.to.startsWith('0x') &&
    !isKnownContactAddress(sendContext.to, sendContext.contacts ?? [])
  ) {
    tier = 'confirm';
  }

  return tier;
}

/**
 * Tools without a financial-value mapping (e.g. `claim_rewards`).
 * Treated as auto-approve client-side because they carry no spendable
 * USD value — the engine still validates them.
 *
 * `save_contact` is intentionally NOT here: the audric override in
 * `lib/engine/contact-tools.ts` runs with `permissionLevel: 'auto'` so
 * the engine executes it server-side and never emits `pending_action`.
 * Listing it here would be dead code.
 */
const NON_FINANCIAL_AUTO_APPROVE = new Set(['claim_rewards']);

/**
 * Per-step gate used for both single-write actions and EACH leg of a
 * bundle. Pulled out of `shouldClientAutoApprove` so the bundle iterator
 * can call it once per leg without duplicating the safety logic.
 *
 * Returns the resolved tier (`auto` | `confirm` | `explicit`). The
 * caller decides what to do — for single writes, anything other than
 * `auto` shows the card. For bundles, `shouldClientAutoApprove` takes
 * the *worst* tier across legs.
 *
 * NOTE the special-cases — these mirror `shouldClientAutoApprove`'s
 * pre-F14 behavior so single-write semantics are unchanged:
 *   - `claim_rewards` is force-auto (no spendable USD).
 *   - `send_transfer` to a raw 0x recipient with no contact match is
 *     force-confirm regardless of amount/preset (the lost-funds
 *     regression we close).
 *   - `agentBudget > 0` and `usd <= agentBudget` is force-auto (an
 *     explicit per-session bypass set in the dashboard).
 */
function resolveStepTier(
  step: Pick<PendingAction, 'toolName' | 'input'>,
  config: UserPermissionConfig,
  sessionSpendUsd: number,
  priceCache: Map<string, number>,
  agentBudget: number,
  contacts: ReadonlyArray<{ address: string }>,
): 'auto' | 'confirm' | 'explicit' {
  if (NON_FINANCIAL_AUTO_APPROVE.has(step.toolName)) return 'auto';

  const operation = toolNameToOperation(step.toolName);
  if (!operation) return 'confirm';

  const usdValue = resolveUsdValue(
    step.toolName,
    (step.input as Record<string, unknown>) ?? {},
    priceCache,
  );

  if (operation === 'send') {
    const to = String((step.input as Record<string, unknown>)?.to ?? '');
    if (to.startsWith('0x') && !isKnownContactAddress(to, contacts)) {
      return 'confirm';
    }
  }

  if (agentBudget > 0 && Number.isFinite(usdValue) && usdValue <= agentBudget) {
    return 'auto';
  }

  const sendContext =
    operation === 'send'
      ? {
          to: String((step.input as Record<string, unknown>)?.to ?? ''),
          contacts,
        }
      : undefined;
  return resolvePermissionTier(operation, usdValue, config, sessionSpendUsd, sendContext);
}

/**
 * The single client-side gate. Returns true when the pending action
 * should be auto-resolved without rendering a `<PermissionCard>`.
 *
 * Resolution order (single-write, unchanged pre-F14 semantics):
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
 *
 * [F14 / 2026-05-03] Bundle path: when `action.steps?.length >= 2`,
 * iterate every step and resolve each leg's tier independently. Return
 * `true` ONLY if EVERY leg resolves to `auto`. Any single confirm/
 * explicit leg surfaces the PermissionCard for the WHOLE bundle. Without
 * this, a 6-op bundle whose step[0] resolved `auto` (e.g. `repay $2` on
 * aggressive preset) silently auto-executed even when step[5] was a
 * `borrow` (always-confirm) — `repay`/`borrow` are independent decisions
 * but the gate only inspected step[0].
 */
export function shouldClientAutoApprove(
  action: Pick<PendingAction, 'toolName' | 'input' | 'steps'>,
  config: UserPermissionConfig,
  sessionSpendUsd: number,
  priceCache: Map<string, number>,
  agentBudget = 0,
  contacts: ReadonlyArray<{ address: string }> = [],
): boolean {
  // [F14] Bundle path. Inspect EVERY step. Worst tier wins.
  // Spend accounting note: we pass `sessionSpendUsd` un-modified to
  // every step's resolver. That's intentional — the daily cap is a
  // SAFETY net, not a per-leg accumulator. If the cap would trip on
  // any single leg under naive accumulation, the user already saw a
  // confirm card on the prior turn (so the cap is doing its job). We
  // don't preemptively trip it inside a bundle.
  if (Array.isArray(action.steps) && action.steps.length >= 2) {
    for (const step of action.steps) {
      const tier = resolveStepTier(
        { toolName: step.toolName, input: step.input },
        config,
        sessionSpendUsd,
        priceCache,
        agentBudget,
        contacts,
      );
      if (tier !== 'auto') return false;
    }
    return true;
  }

  // Single-write path (unchanged pre-F14 behavior).
  return (
    resolveStepTier(action, config, sessionSpendUsd, priceCache, agentBudget, contacts) === 'auto'
  );
}
