/**
 * [S.154 / B6-1 mitigation — 2026-05-18] Pure helper that resolves the
 * `ENGINE_MEMORY_PATH_ENABLED` env-var string into a typed boolean.
 *
 * Extracted from `engine-factory.ts` (S.153 ship — audric `363e4f1`) so the
 * flag-parsing logic is unit-testable independently of `createEngine`
 * (which does a lot of DB / RPC / MCP setup that's expensive to mock).
 *
 * **Accepted truthy values:**
 *   - `'1'` (canonical Vercel UI value the operator types)
 *   - `'true'` / `'TRUE'` / `'True'` (case-insensitive)
 *
 * **Everything else returns `false`:**
 *   - `undefined` (env-var not set — production default)
 *   - empty / whitespace-only strings (already normalized to `undefined` by
 *     the `optionalString` zod transform in `env.ts`, but defended here too
 *     in case a caller bypasses the env module)
 *   - `'0'`, `'false'`, `'no'`, `'off'`, `'yes'` etc — any other value
 *
 * **Why the conservative truthy set:** mirrors the values an operator would
 * actually set in Vercel's UI for "turn this on." A permissive `Boolean(v)`
 * coercion would treat `'0'` as truthy (non-empty string), which is exactly
 * the bug class env-validation-gate.mdc was written to prevent.
 *
 * **Why string-only (not `boolean | string | undefined`):** `env.ts` types
 * `ENGINE_MEMORY_PATH_ENABLED` as `string | undefined` via `optionalString`.
 * If a future schema change widens the type, update this signature too —
 * don't widen the helper to absorb the schema drift silently.
 */
export function isMemoryPathEnabled(
  envValue: string | undefined,
): boolean {
  if (envValue === undefined) return false;
  if (envValue === '1') return true;
  if (envValue.toLowerCase() === 'true') return true;
  return false;
}
