import { describe, it, expect } from 'vitest';
import { clampProposalEffort } from './engine-factory';

// [S.126 Tier 2f / 2026-05-09] Clamp regression tests. The clamp's job is
// to demote `high` → `medium` ONLY when high came from the engine
// classifier's `sessionWriteCount + write-verb` heuristic — rich-intent
// `high` (rebalance / safe-borrow / account-report / swap-and-save /
// emergency-withdraw) and any non-`high` input must pass through unchanged.
//
// SPEC v0.7a Phase 6 (D-4 a / 2026-05-17) — `matchedRecipe` arg removed;
// recipes deleted in Phase 6 6E. The `!matchedRecipe` exclusion was
// replaced by the `!RICH_INTENT.test(message)` exclusion — same intent,
// keyed on message text instead of a deleted runtime registry.

describe('clampProposalEffort — Tier 2f', () => {
  describe('clamp fires (high → medium)', () => {
    it('clamps when classifier high + write verb + prior writes + no rich intent', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'swap 0.1 USDC to SUI',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'medium', clamped: true });
    });

    it('clamps for each write verb individually', () => {
      const verbs = ['swap 0.1 USDC', 'borrow $100', 'withdraw 50 USDC', 'send to alice'];
      for (const message of verbs) {
        expect(
          clampProposalEffort({
            classifierEffort: 'high',
            message,
            sessionWriteCount: 1,
          }),
        ).toEqual({ effort: 'medium', clamped: true });
      }
    });

    it('clamps when sessionWriteCount > 1 (later writes in long sessions)', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'swap 0.1 USDC to SUI',
        sessionWriteCount: 5,
      });
      expect(result).toEqual({ effort: 'medium', clamped: true });
    });
  });

  describe('clamp does NOT fire (passes through)', () => {
    it('preserves rich-intent high — safe-borrow (replaces old "recipe-driven" carve-out)', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'safely borrow $500 against my savings',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });

    it('preserves rich-intent high — rebalance', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'rebalance my portfolio',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });

    it('preserves rich-intent high — account report', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'give me a full report',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });

    it('preserves rich-intent high — swap and save', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'swap SUI and save the USDC',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });

    it('preserves rich-intent high — emergency withdraw', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'emergency withdraw everything',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });

    it('preserves rich-intent high — bulk send/mail/transfer (engine bug fix — Phase 6 audit-6)', () => {
      // Pre-audit bug: RICH_INTENT missed `bulk\s+(send|mail|transfer)`.
      // Engine's `classify-effort.ts` returns `high` for "bulk send USDC to
      // alice + bob"; because `send` is a write verb and audric's clamp
      // didn't see this as rich, it demoted to `medium`, defeating the
      // engine's intentional high-tier allocation for batch flows.
      for (const message of [
        'bulk send USDC to my contacts',
        'bulk mail receipts to vendors',
        'bulk transfer 10 USDC each',
      ]) {
        expect(
          clampProposalEffort({
            classifierEffort: 'high',
            message,
            sessionWriteCount: 1,
          }),
        ).toEqual({ effort: 'high', clamped: false });
      }
    });

    it('preserves high when no prior writes (fresh session — first write needs extra reasoning is a different code path; classifier already returns medium for sessionWriteCount=0)', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'swap 0.1 USDC to SUI',
        sessionWriteCount: 0,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });

    it('preserves high when message has no write verb (defensive — classifier should have routed elsewhere, but if high arrives via override, do not clamp)', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'show me my portfolio breakdown',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });

    it('passes through medium unchanged', () => {
      const result = clampProposalEffort({
        classifierEffort: 'medium',
        message: 'swap 0.1 USDC to SUI',
        sessionWriteCount: 0,
      });
      expect(result).toEqual({ effort: 'medium', clamped: false });
    });

    it('passes through low unchanged', () => {
      const result = clampProposalEffort({
        classifierEffort: 'low',
        message: 'whats my balance',
        sessionWriteCount: 0,
      });
      expect(result).toEqual({ effort: 'low', clamped: false });
    });

    it('passes through max unchanged (Opus rebalance routing)', () => {
      const result = clampProposalEffort({
        classifierEffort: 'max',
        message: 'rebalance my portfolio',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'max', clamped: false });
    });

    it('preserves high when message is undefined (resume / non-message engine creation)', () => {
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: undefined,
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });
  });

  describe('regex tightness — write-verb gate uses word boundaries', () => {
    it('does not clamp on substring match (e.g., "swappable" should NOT trigger swap)', () => {
      // \b ensures "swap" matches as a whole word, not inside "swapchain".
      // (This is more of a defensive test — `classifyEffort` itself uses
      // /borrow|withdraw|send|swap/i without word boundaries, so the engine
      // would still return high for "swapchain". The clamp's stricter \b
      // means the clamp won't kick in. Acceptable: a false-negative on
      // clamp = stays on high = no latency regression vs current; just no
      // optimization win for that edge case.)
      const result = clampProposalEffort({
        classifierEffort: 'high',
        message: 'is this swapchain a good investment',
        sessionWriteCount: 1,
      });
      expect(result).toEqual({ effort: 'high', clamped: false });
    });
  });
});
