/**
 * spec-consistency.ts — Audric Harness Correctness Spec v1.4 / Item 5
 *
 * Runs nine assertions against the live `@t2000/sdk` + `@t2000/engine` exports
 * and the audric-side `STATIC_SYSTEM_PROMPT` to guarantee that the values
 * documented in the spec, encoded in the SDK, and surfaced to the LLM never
 * silently drift apart.
 *
 * The same module powers two enforcement paths:
 *   1. CI: invoked as a script (`tsx apps/web/lib/engine/spec-consistency.ts`)
 *      so a regression fails the build before merge.
 *   2. Runtime: imported by `engine-factory.ts` so a dev-mode boot trips a
 *      hard error and a prod-mode boot logs the violation. See `runStartupCheck`.
 *
 * The nine assertions (per spec line 1681 + plan Day 5):
 *   - 6 fee constants — SAVE_FEE_BPS=10n, BORROW_FEE_BPS=5n,
 *     OVERLAY_FEE_RATE=0.001, and three "no fee" guards
 *     (no WITHDRAW_FEE / REPAY_FEE / SEND_FEE exports).
 *   - 2 token decimals — USDC_DECIMALS=6, SUI_DECIMALS=9.
 *   - 1 tool-count assertion — STATIC_SYSTEM_PROMPT's interpolated
 *     "(${READ_COUNT} read tools, ${WRITE_COUNT} write tools)" matches
 *     the live `READ_TOOLS.length` + `WRITE_TOOLS.length` registry.
 */
import * as sdk from '@t2000/sdk';
import { READ_TOOLS, WRITE_TOOLS } from '@t2000/engine';
import { STATIC_SYSTEM_PROMPT } from './engine-context';

// Re-import the canonical portfolio surface so the runtime check below
// fails if anyone deletes / renames the canonical exports without
// updating every adapter. ESLint catches forbidden *imports*, this
// catches the dual case: the canonical itself going missing.
import * as canonicalPortfolio from '@/lib/portfolio';
import * as canonicalHistory from '@/lib/transaction-history';
import * as canonicalRates from '@/lib/rates';

// `sdk` exports `SAVE_FEE_BPS`, `BORROW_FEE_BPS`, and `OVERLAY_FEE_RATE`
// natively as of @t2000/sdk 0.41.0. Read the "no fee" guards through an
// indexed view since we're checking that they remain absent.
const sdkLookup = sdk as unknown as Record<string, unknown>;

export interface SpecAssertion {
  /** Stable identifier used in CI logs and error messages. */
  id: string;
  /** True when the assertion holds, false when it fails. */
  pass: boolean;
  /** Human-readable explanation surfaced on failure. */
  message: string;
}

export interface SpecConsistencyResult {
  ok: boolean;
  assertions: SpecAssertion[];
}

/**
 * Run every spec assertion and return a structured result. Callers that want
 * fail-fast semantics should use {@link assertSpecConsistency}.
 */
export function runSpecConsistencyChecks(): SpecConsistencyResult {
  const assertions: SpecAssertion[] = [];

  // ── 6 fee assertions ────────────────────────────────────────────────────
  // BigInt literal `10n` requires ES2020. The audric tsconfig targets ES2017,
  // so we use `BigInt(...)` to keep the source portable across both repos.
  const TEN_BIGINT = BigInt(10);
  const FIVE_BIGINT = BigInt(5);

  // 1. SAVE_FEE_BPS
  const saveFee = sdk.SAVE_FEE_BPS;
  assertions.push({
    id: 'SAVE_FEE_BPS',
    pass: typeof saveFee === 'bigint' && saveFee === TEN_BIGINT,
    message: `expected 10n, got ${String(saveFee)}`,
  });

  // 2. BORROW_FEE_BPS
  const borrowFee = sdk.BORROW_FEE_BPS;
  assertions.push({
    id: 'BORROW_FEE_BPS',
    pass: typeof borrowFee === 'bigint' && borrowFee === FIVE_BIGINT,
    message: `expected 5n, got ${String(borrowFee)}`,
  });

  // 3. OVERLAY_FEE_RATE — exported from cetus-swap.ts via the SDK barrel.
  const overlayRate = sdk.OVERLAY_FEE_RATE;
  assertions.push({
    id: 'OVERLAY_FEE_RATE',
    pass: overlayRate === 0.001,
    message: `expected 0.001, got ${String(overlayRate)}`,
  });

  // 4-6. Three "no fee" guards — the spec mandates withdraw, repay, and send
  // remain free. Catch a future drift where someone re-introduces a fee under
  // a familiar name without updating the spec.
  for (const banned of ['WITHDRAW_FEE_BPS', 'REPAY_FEE_BPS', 'SEND_FEE_BPS']) {
    const present = sdkLookup[banned];
    assertions.push({
      id: `NO_${banned}`,
      pass: present === undefined,
      message: `${banned} should not be exported (spec: free for users)`,
    });
  }

  // ── 2 token decimal assertions ──────────────────────────────────────────
  assertions.push({
    id: 'USDC_DECIMALS',
    pass: sdk.USDC_DECIMALS === 6,
    message: `expected 6, got ${String(sdk.USDC_DECIMALS)}`,
  });
  assertions.push({
    id: 'SUI_DECIMALS',
    pass: sdk.SUI_DECIMALS === 9,
    message: `expected 9, got ${String(sdk.SUI_DECIMALS)}`,
  });

  // ── 1 runtime tool-count assertion ──────────────────────────────────────
  // STATIC_SYSTEM_PROMPT interpolates the totals at module load. If the
  // engine's tool registry changes after the prompt was templated (or vice
  // versa), the regex below will fail to match the live numbers.
  const readCount = READ_TOOLS.length;
  const writeCount = WRITE_TOOLS.length;
  const totalCount = readCount + writeCount;
  const expectedPhrase = `${totalCount} tools (${readCount} read tools, ${writeCount} write tools)`;
  assertions.push({
    id: 'STATIC_SYSTEM_PROMPT_TOOL_COUNTS',
    pass: STATIC_SYSTEM_PROMPT.includes(expectedPhrase),
    message:
      `STATIC_SYSTEM_PROMPT must contain "${expectedPhrase}" — drift from ` +
      `READ_TOOLS (${readCount}) + WRITE_TOOLS (${writeCount}) indicates the ` +
      'engine package and audric prompt are out of sync.',
  });

  // ── 1 caption-fidelity prompt rule assertion ───────────────────────────
  // The "NEVER CONTRADICT THE CARD" sentence is a load-bearing safety
  // rule (Apr 2026 — bug where the LLM said "no active savings" while
  // the savings card showed $100 — see audric-build-tracker.md S.18+).
  // If a future prompt edit reflows this section and accidentally drops
  // the rule, this assertion catches it before the engine boots.
  assertions.push({
    id: 'STATIC_SYSTEM_PROMPT_NEVER_CONTRADICT_CARD',
    pass: STATIC_SYSTEM_PROMPT.includes('NEVER CONTRADICT THE CARD'),
    message:
      'STATIC_SYSTEM_PROMPT must contain the "NEVER CONTRADICT THE CARD" ' +
      'caption-fidelity rule. This rule prevents the LLM from describing a ' +
      'position as "no", "none", or "zero" when the card shows a positive ' +
      'value. Removing it re-opens the regression.',
  });

  // ── 1 DeFi-unavailable prompt rule assertion ───────────────────────────
  // Companion to the above — when BlockVision DeFi fetch is degraded
  // (missing API key, every protocol failed), `balance_check` returns
  // `defi: 0` with `defiSource: 'degraded'` and a displayText that says
  // "DeFi positions: UNAVAILABLE". Without this rule, the LLM sees `0`
  // and confidently claims "no DeFi positions" — which is wrong.
  // Apr 2026 — discovered during regression after the audric SOT pass.
  assertions.push({
    id: 'STATIC_SYSTEM_PROMPT_DEFI_UNAVAILABLE_RULE',
    pass: STATIC_SYSTEM_PROMPT.includes('NEVER CLAIM "NO DEFI POSITIONS"'),
    message:
      'STATIC_SYSTEM_PROMPT must contain the "NEVER CLAIM \\"NO DEFI ' +
      'POSITIONS\\" UNLESS THE TOOL CONFIRMS IT" rule. Without it the LLM ' +
      'will assert "no DeFi positions" when the underlying BlockVision ' +
      'fetch is degraded (e.g. missing/empty BLOCKVISION_API_KEY in the ' +
      'runtime). The rule must teach the LLM to check displayText for ' +
      '"DeFi positions: UNAVAILABLE" before claiming the slice is empty.',
  });

  // ── 4 canonical-portfolio export assertions ────────────────────────────
  // Single-source-of-truth (Apr 2026, see
  // `.cursor/rules/single-source-of-truth.mdc`): every consumer of
  // wallet / position / price / history data MUST go through the
  // canonical fetchers below. These assertions catch the dual case
  // ESLint can't — someone deleting / renaming the canonical export
  // itself, which would silently break every adapter.
  assertions.push({
    id: 'CANONICAL_GET_PORTFOLIO',
    pass: typeof canonicalPortfolio.getPortfolio === 'function',
    message:
      '`getPortfolio` must remain exported from `@/lib/portfolio` — every ' +
      'API route, hook, engine tool, and cron depends on this single source.',
  });
  assertions.push({
    id: 'CANONICAL_GET_TOKEN_PRICES',
    pass: typeof canonicalPortfolio.getTokenPrices === 'function',
    message:
      '`getTokenPrices` must remain exported from `@/lib/portfolio` — ' +
      'engine prompt seeding and price-display callers depend on it.',
  });
  assertions.push({
    id: 'CANONICAL_GET_TRANSACTION_HISTORY',
    pass: typeof canonicalHistory.getTransactionHistory === 'function',
    message:
      '`getTransactionHistory` must remain exported from ' +
      '`@/lib/transaction-history` — `/api/history`, `/api/activity`, and ' +
      'the engine `transaction_history` tool all depend on it.',
  });
  assertions.push({
    id: 'CANONICAL_GET_RATES',
    pass: typeof canonicalRates.getRates === 'function',
    message:
      '`getRates` must remain exported from `@/lib/rates` — `/api/rates` ' +
      'and the engine `rates_info` tool depend on it.',
  });

  return {
    ok: assertions.every((a) => a.pass),
    assertions,
  };
}

/**
 * Throw an aggregated error if any assertion fails. Useful for CI scripts
 * and `runStartupCheck` in dev mode.
 */
export function assertSpecConsistency(): void {
  const result = runSpecConsistencyChecks();
  if (result.ok) return;
  const failures = result.assertions
    .filter((a) => !a.pass)
    .map((a) => `  ✗ ${a.id}: ${a.message}`)
    .join('\n');
  throw new Error(
    `[spec-consistency] ${result.assertions.filter((a) => !a.pass).length}/${result.assertions.length} assertions failed:\n${failures}`,
  );
}

/**
 * Boot-time hook used by `engine-factory.ts`. Hard-fails in dev so local
 * development surfaces drift immediately; logs in prod so deploys never
 * crash on a constant mismatch (the CI gate is the real enforcement).
 */
export function runStartupCheck(): void {
  const result = runSpecConsistencyChecks();
  if (result.ok) return;

  const failures = result.assertions
    .filter((a) => !a.pass)
    .map((a) => `  ✗ ${a.id}: ${a.message}`)
    .join('\n');

  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`[spec-consistency] startup assertion failed:\n${failures}`);
  }

  console.error(`[spec-consistency] startup assertion failed (logged-only in prod):\n${failures}`);
}

// Note: the static "forbidden import" scanner lives in
// `scripts/canonical-source-scan.mjs` as a self-contained Node script so
// it can run in any CI environment without needing the `@t2000/*`
// workspace resolver. ESLint enforces the same rules at dev time; the
// scan script is the redundant CI gate.
