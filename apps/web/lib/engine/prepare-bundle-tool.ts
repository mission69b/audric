/**
 * `prepare_bundle` — plan-time bundle commitment tool (SPEC 14)
 *
 * The LLM calls this ONCE during the plan turn for any multi-write
 * Payment Stream (N≥2 writes). The tool validates the typed steps and
 * stashes them in Redis with a 60s TTL. When the user later replies
 * affirmatively, the chat-route fast-path (SPEC 14 Phase 2) reads +
 * consumes the stash and yields a `pending_action_bundle` SSE event
 * directly — without round-tripping the LLM.
 *
 * This decouples the bundle invariant from LLM emission timing, which
 * was the load-bearing failure mode in `1.14.0 → 1.14.3`. See
 * `spec/SPEC_14_PREPARE_BUNDLE_PLAN_TIME_COMMITMENT.md` for the full
 * design + rationale.
 */

import { buildTool, MAX_BUNDLE_OPS, VALID_PAIRS } from '@t2000/engine';
import type { ToolContext, ToolResult } from '@t2000/engine';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  writeBundleProposal,
  type BundleProposal,
  type BundleProposalStep,
} from './bundle-proposal-store';

const KNOWN_WRITE_TOOLS = [
  'save_deposit',
  'withdraw',
  'borrow',
  'repay_debt',
  'send_transfer',
  'swap_execute',
  'claim_rewards',
  'volo_stake',
  'volo_unstake',
] as const;

/**
 * Local copy of `inferProducerOutputAsset` from
 * `@t2000/engine/src/compose-bundle.ts`. Engine 1.14.0 doesn't export
 * this helper; SPEC 14 Phase 3 (retirement) will engine-bump and
 * switch this to an import. Behavior MUST stay in lockstep with the
 * engine-side version — `prepare-bundle-tool.test.ts` pins the
 * canonical behavior across the same input set.
 *
 * TODO(SPEC 14 Phase 3): switch to `import { inferProducerOutputAsset }
 * from '@t2000/engine'` once engine ≥ 1.15 ships those exports.
 */
function inferProducerOutputAsset(toolName: string, input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const i = input as Record<string, unknown>;
  if (toolName === 'swap_execute') {
    return typeof i.to === 'string' ? i.to.toLowerCase() : null;
  }
  if (toolName === 'withdraw' || toolName === 'borrow') {
    return typeof i.asset === 'string' ? i.asset.toLowerCase() : 'usdc';
  }
  return null;
}

/** See `inferProducerOutputAsset` JSDoc — same retirement plan. */
function inferConsumerInputAsset(toolName: string, input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const i = input as Record<string, unknown>;
  if (
    toolName === 'send_transfer' ||
    toolName === 'save_deposit' ||
    toolName === 'repay_debt'
  ) {
    return typeof i.asset === 'string' ? i.asset.toLowerCase() : 'usdc';
  }
  if (toolName === 'swap_execute') {
    return typeof i.from === 'string' ? i.from.toLowerCase() : null;
  }
  return null;
}

/** See `inferProducerOutputAsset` JSDoc — same retirement plan. */
function shouldChainCoin(
  producer: { name: string; input: unknown },
  consumer: { name: string; input: unknown },
): boolean {
  const pair = `${producer.name}->${consumer.name}`;
  if (!VALID_PAIRS.has(pair)) return false;
  const out = inferProducerOutputAsset(producer.name, producer.input);
  const inA = inferConsumerInputAsset(consumer.name, consumer.input);
  if (!out || !inA) return false;
  return out === inA;
}

const stepSchema = z.object({
  toolName: z.enum(KNOWN_WRITE_TOOLS),
  input: z.record(z.unknown()),
  inputCoinFromStep: z.number().int().min(0).optional(),
});

type StepInput = z.infer<typeof stepSchema>;

/**
 * Unified result shape for prepare_bundle. Either every branch returns
 * `{ ok: true, ... }` or `{ ok: false, reason, details, ... }`. All
 * optional fields below are present in at least one branch — declaring
 * them on the union avoids per-branch widening that fails the
 * `ToolResult<T>` constraint.
 *
 * **Phase 3a (1.15.0):** `pair_not_whitelisted` removed from the
 * union — the adjacency-whitelist rejection has been replaced by
 * DAG-aware semantics (whitelisted asset-aligned pairs auto-thread
 * via `inputCoinFromStep`; non-chained pairs run wallet-mode
 * independently inside the same atomic PTB). Plan-time rejection
 * paths reduce to `no_session` + `no_wallet`.
 */
type PrepareBundleData =
  | {
      ok: true;
      bundleId: string;
      summary: string;
      expiresAt: number;
      validatedChain: boolean;
      stepCount: number;
    }
  | {
      ok: false;
      reason: 'no_session' | 'no_wallet';
      details: string;
    };

/**
 * Build a 1-line human-readable summary of the bundle for the
 * `BundleProposal.summary` field. The LLM uses this in the plan-turn
 * text it shows to the user; the fast-path also surfaces it on the
 * confirm card for self-consistency.
 */
function summarizeBundle(steps: StepInput[]): string {
  const parts = steps.map((s) => {
    const i = s.input;
    if (s.toolName === 'withdraw') {
      return `withdraw ${i.amount ?? '?'} ${(i.asset as string | undefined) ?? 'USDC'}`;
    }
    if (s.toolName === 'save_deposit') {
      return `save ${i.amount ?? '?'} ${(i.asset as string | undefined) ?? 'USDC'}`;
    }
    if (s.toolName === 'borrow') {
      return `borrow ${i.amount ?? '?'} ${(i.asset as string | undefined) ?? 'USDC'}`;
    }
    if (s.toolName === 'repay_debt') {
      return `repay ${i.amount ?? '?'} ${(i.asset as string | undefined) ?? 'USDC'}`;
    }
    if (s.toolName === 'send_transfer') {
      return `send ${i.amount ?? '?'} ${(i.asset as string | undefined) ?? 'USDC'}`;
    }
    if (s.toolName === 'swap_execute') {
      return `swap ${i.amount ?? '?'} ${i.from ?? '?'} → ${i.to ?? '?'}`;
    }
    return s.toolName;
  });
  return parts.join(' → ');
}

/**
 * Read the active session ID out of the `ToolContext`. Audric threads
 * `SESSION_ID` via the engine's `env` field (see `engine-factory.ts`).
 * Returns null if missing — callers MUST treat that as a hard error
 * because the stash is session-scoped.
 */
function readSessionId(context: ToolContext): string | null {
  const sid = context.env?.SESSION_ID;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}

export const audricPrepareBundleTool = buildTool({
  name: 'prepare_bundle',
  description:
    `Pre-commit a multi-write Payment Stream (${MAX_BUNDLE_OPS}-op cap) at PLAN time. ` +
    'Call this ONCE in the plan turn with the full typed step list, then write your text plan ' +
    'and ask the user to confirm. When the user replies affirmatively, the bundle executes ' +
    'as one atomic Sui transaction without re-emitting the writes. ' +
    'For single writes (N=1), DO NOT call this — emit the write tool directly. ' +
    'Validates: (a) 2≤N≤cap. ' +
    'Chain-mode (auto-populates `inputCoinFromStep`) for whitelisted asset-aligned pairs: ' +
    'swap_execute→send_transfer, swap_execute→save_deposit, swap_execute→repay_debt, ' +
    'withdraw→swap_execute, withdraw→send_transfer, borrow→send_transfer, borrow→repay_debt. ' +
    'Non-chained adjacent steps (e.g. two independent sends) run wallet-mode in the same atomic PTB.',
  inputSchema: z.object({
    steps: z
      .array(stepSchema)
      .min(2, 'Bundle requires at least 2 writes; for single writes emit the tool directly.')
      .max(MAX_BUNDLE_OPS, `Bundle cap is ${MAX_BUNDLE_OPS} writes — split longer flows.`)
      .describe('Ordered list of writes. First step runs first.'),
    reason: z
      .string()
      .max(200)
      .optional()
      .describe('Optional 1-line rationale shown on the confirm card.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        minItems: 2,
        maxItems: MAX_BUNDLE_OPS,
        items: {
          type: 'object',
          properties: {
            toolName: {
              type: 'string',
              enum: [...KNOWN_WRITE_TOOLS],
              description: 'Write tool to execute as part of the bundle.',
            },
            input: {
              type: 'object',
              description: 'Input args for the write tool. Same shape as if calling the tool directly.',
            },
            inputCoinFromStep: {
              type: 'integer',
              minimum: 0,
              description:
                'Optional. Index of a prior step whose output coin should feed this step\'s input. ' +
                'When omitted, audric auto-populates this for whitelisted asset-aligned pairs.',
            },
          },
          required: ['toolName', 'input'],
        },
        description: 'Ordered list of writes for the atomic bundle.',
      },
      reason: { type: 'string', description: 'Optional 1-line rationale.' },
    },
    required: ['steps'],
  },
  isReadOnly: true,
  permissionLevel: 'auto',

  call: async (input, context: ToolContext): Promise<ToolResult<PrepareBundleData>> => {
    const sessionId = readSessionId(context);
    if (!sessionId) {
      return {
        data: {
          ok: false,
          reason: 'no_session',
          details:
            'prepare_bundle was called outside an active session. ' +
            'This is an internal error — fall back to emitting the writes directly.',
        },
        displayText: 'Bundle preparation failed (no session). Emit writes directly.',
      };
    }

    const walletAddress = context.walletAddress;
    if (!walletAddress) {
      return {
        data: {
          ok: false,
          reason: 'no_wallet',
          details: 'No wallet in tool context. Cannot prepare bundle.',
        },
        displayText: 'Bundle preparation failed (no wallet).',
      };
    }

    // [Phase 3a / 1.15.0] No envelope-level adjacency rejection. Pre-3a
    // the prepare_bundle tool refused any bundle where any (i, i+1)
    // pair fell outside `VALID_PAIRS`. Phase 3a relaxes this: the
    // chain-mode population below opportunistically wires
    // `inputCoinFromStep` for whitelisted asset-aligned pairs;
    // non-chained pairs run wallet-mode independently inside the same
    // atomic PTB. The SDK's existing `T2000Error('NO_COINS_FOUND')`
    // wallet-mode preflight surfaces any bad-shape failures at
    // /api/transactions/prepare time before the user signs.
    //
    // `VALID_PAIRS` is still imported (used in JSDoc-style debug
    // strings if ever needed); `checkValidPair` is no longer needed
    // here because the population loop calls `shouldChainCoin`
    // directly.

    // Chain-mode inference: for each adjacent pair where shouldChainCoin
    // returns true, populate `inputCoinFromStep` on the consumer if the
    // LLM didn't already set it. This is the only validation Phase 3a
    // applies to bundle envelopes.
    const wiredSteps: BundleProposalStep[] = input.steps.map((step, i) => {
      const out: BundleProposalStep = {
        toolName: step.toolName,
        input: step.input,
      };
      if (step.inputCoinFromStep !== undefined) {
        out.inputCoinFromStep = step.inputCoinFromStep;
        return out;
      }
      if (i === 0) return out;
      const prior = input.steps[i - 1];
      const producerCall = { name: prior.toolName, input: prior.input };
      const consumerCall = { name: step.toolName, input: step.input };
      if (shouldChainCoin(producerCall, consumerCall)) {
        out.inputCoinFromStep = i - 1;
      }
      return out;
    });

    const validatedChain = wiredSteps.some((s) => s.inputCoinFromStep !== undefined);

    const bundleId = randomUUID();
    const now = Date.now();
    const expiresAt = now + 60_000;
    const summary = summarizeBundle(input.steps);

    const proposal: BundleProposal = {
      bundleId,
      walletAddress,
      steps: wiredSteps,
      expiresAt,
      reason: input.reason,
      validatedAt: now,
      summary,
    };

    await writeBundleProposal(sessionId, proposal);

    return {
      data: {
        ok: true,
        bundleId,
        summary,
        expiresAt,
        validatedChain,
        stepCount: wiredSteps.length,
      },
      displayText: `Bundle ready: ${summary}. Awaiting user confirmation.`,
    };
  },
});

// Re-export the inference helpers for unit tests (kept private from
// the public module surface — the test file imports via __testOnly__).
export const __testOnly__ = {
  inferProducerOutputAsset,
  inferConsumerInputAsset,
  shouldChainCoin,
  summarizeBundle,
  KNOWN_WRITE_TOOLS,
};
