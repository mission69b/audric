// ---------------------------------------------------------------------------
// __tests__/full-dynamic-context-separated.test.ts
// ---------------------------------------------------------------------------
//
// [S.153 / engine v2.7.0 dry-run — 2026-05-18]
//
// Pins the contract `buildFullDynamicContextSeparated` makes to the
// Phase 7 memory path (gated by `env.ENGINE_MEMORY_PATH_ENABLED`):
//
//   - `baseDynamic` MUST NOT contain the inline `<financial_context>`
//     XML — the engine re-injects it at prepareStep layer 2.
//
//   - `financialContextBlock` MUST match what
//     `buildFinancialContextBlock(opts.financialContext)` returns
//     standalone — same content, different delivery mechanism.
//
//   - When `financialContext` is null/undefined, `financialContextBlock`
//     is the empty string (engine drops the layer entirely via
//     `.filter(l => l.length > 0)`).
//
//   - The intelligence / advice / contacts / proactive sections of the
//     dynamic block survive the split (we only extract financial, not
//     anything else).
//
// Together with engine v2.7.0's `five-layer-ordering.test.ts`, these
// invariants guarantee the dry-run prompt content is equivalent to the
// legacy path when memoryStore returns [] (which the mock always does).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  buildFullDynamicContext,
  buildFullDynamicContextSeparated,
  buildFinancialContextBlock,
} from '../engine-context';
import type { Tool } from '@t2000/engine';
import type { FinancialContextSnapshot } from '@/lib/redis/user-financial-context';

const TEST_ADDRESS = '0x91b88d0e7eaf45e3252a06ad57f6b9c79b1e7f8d3e0a6c1d2b3c4d5e6f7a8b9c';

const STUB_TOOL: Tool = {
  name: 'stub_read',
  description: 'stub',
  inputSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  isConcurrencySafe: true,
  permissionLevel: 'auto',
  call: async () => ({ ok: true }),
} as unknown as Tool;

const STUB_TOOLS: Tool[] = [STUB_TOOL];

const STUB_SNAPSHOT: FinancialContextSnapshot = {
  savingsUsdc: 100,
  savingsUsdsui: null,
  debtUsdc: 0,
  walletUsdc: 50,
  walletUsdsui: null,
  healthFactor: null,
  currentApy: 4.5,
  recentActivity: 'No recent activity.',
  pendingAdvice: null,
  daysSinceLastSession: 1,
};

describe('buildFullDynamicContextSeparated (Phase 7 memory path)', () => {
  describe('financial-context extraction', () => {
    it('baseDynamic does NOT contain the inline <financial_context> XML', () => {
      const { baseDynamic } = buildFullDynamicContextSeparated(
        TEST_ADDRESS,
        STUB_TOOLS,
        { financialContext: STUB_SNAPSHOT },
      );
      expect(baseDynamic).not.toContain('<financial_context>');
      expect(baseDynamic).not.toContain('</financial_context>');
      // The legacy "## Daily orientation snapshot" heading is also gone
      // — engine delivers the raw XML at layer 2 without a heading.
      expect(baseDynamic).not.toContain('## Daily orientation snapshot');
    });

    it('financialContextBlock equals standalone buildFinancialContextBlock output', () => {
      const { financialContextBlock } = buildFullDynamicContextSeparated(
        TEST_ADDRESS,
        STUB_TOOLS,
        { financialContext: STUB_SNAPSHOT },
      );
      const expected = buildFinancialContextBlock(STUB_SNAPSHOT);
      expect(financialContextBlock).toBe(expected);
      // Sanity: the standalone output is non-empty for our stub snapshot.
      expect(expected).toContain('<financial_context>');
    });

    it('financialContextBlock is empty string when financialContext is null', () => {
      const { financialContextBlock } = buildFullDynamicContextSeparated(
        TEST_ADDRESS,
        STUB_TOOLS,
        { financialContext: null },
      );
      // Empty string lets the engine's `.filter(l => l.length > 0)` drop
      // the layer entirely — no `<financial_context></financial_context>`
      // wrapper pollutes the assembled prompt.
      expect(financialContextBlock).toBe('');
    });

    it('financialContextBlock is empty string when financialContext is undefined', () => {
      const { financialContextBlock } = buildFullDynamicContextSeparated(
        TEST_ADDRESS,
        STUB_TOOLS,
        {},
      );
      expect(financialContextBlock).toBe('');
    });
  });

  describe('legacy parity', () => {
    it('baseDynamic + extracted financial = same content shape as legacy buildFullDynamicContext', () => {
      // Setup: identical inputs to both builders.
      const opts = {
        financialContext: STUB_SNAPSHOT,
        contacts: [],
        adviceContext: 'Test advice context.',
      };

      const legacy = buildFullDynamicContext(TEST_ADDRESS, STUB_TOOLS, opts);
      const { baseDynamic, financialContextBlock } =
        buildFullDynamicContextSeparated(TEST_ADDRESS, STUB_TOOLS, opts);

      // Both paths must mention the advice context (proves the split
      // doesn't drop non-financial sections).
      expect(legacy).toContain('Test advice context.');
      expect(baseDynamic).toContain('Test advice context.');

      // Legacy contains the financial XML inline; separated doesn't —
      // but the same XML is available via financialContextBlock.
      expect(legacy).toContain('<financial_context>');
      expect(baseDynamic).not.toContain('<financial_context>');
      expect(financialContextBlock).toContain('<financial_context>');

      // The Proactive Awareness / Self-Evaluation sections — added by
      // buildFullDynamicContext at the tail — must appear in baseDynamic
      // too (the separated helper delegates to buildFullDynamicContext
      // with financial nulled out).
      expect(baseDynamic).toContain('## Proactive Awareness');
      expect(baseDynamic).toContain('## Self-Evaluation');
    });

    it('baseDynamic with no financial input is equivalent to legacy with no financial', () => {
      // Edge case: when the user has no daily snapshot yet, both paths
      // should produce equivalent prompts (no financial layer anywhere).
      const opts = { financialContext: null };

      const legacy = buildFullDynamicContext(TEST_ADDRESS, STUB_TOOLS, opts);
      const { baseDynamic } = buildFullDynamicContextSeparated(
        TEST_ADDRESS,
        STUB_TOOLS,
        opts,
      );

      expect(legacy).toBe(baseDynamic);
    });
  });
});
