/**
 * Minimal tool-part renderer for the Day 2b audric chat surface.
 *
 * The production audric chat renders a rich card per registered tool
 * (BalanceCard, SavingsCard, HealthCard, etc. — see `components/canvases/`
 * in audric/web). Phase 5's "renderer migration sweep" ports those rich
 * cards to web-v2. Until then this placeholder renders `{toolName, input,
 * output, state}` as syntax-highlighted JSON in a bordered panel — enough
 * to prove the end-to-end pipeline (engine → AI SDK v6 part → DOM) on
 * the new chat surface.
 *
 * AI SDK v6 part shape (from `ai/dist/index.d.ts`):
 *   {
 *     type: `tool-${toolName}`,
 *     toolCallId: string,
 *     state: 'input-streaming' | 'input-available' | 'output-available'
 *          | 'output-error' | 'output-denied' | ...,
 *     input?: unknown,
 *     output?: unknown,
 *     errorText?: string,
 *   }
 *
 * Renderer purposefully has zero behavior — display only. The actual
 * approval / regenerate flows land in Phase 3 (write tools) and
 * Phase 5 (rich card semantics).
 */

type AudricToolPartProps = {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export function AudricToolPart({
  toolName,
  state,
  input,
  output,
  errorText,
}: AudricToolPartProps) {
  return (
    <div className="my-2 rounded-md border border-zinc-700 bg-zinc-900 p-3 text-zinc-100 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono">tool</span>
        <span className="font-mono font-semibold">{toolName}</span>
        <span className="text-zinc-400">·</span>
        <span className="text-zinc-400">{state}</span>
      </div>

      {input !== undefined && (
        <details className="mb-2">
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
            input
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-950 p-2 text-xs">
            {safeJson(input)}
          </pre>
        </details>
      )}

      {output !== undefined && (
        <details open>
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
            output
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-950 p-2 text-xs">
            {safeJson(output)}
          </pre>
        </details>
      )}

      {errorText && (
        <div className="mt-2 rounded bg-red-950 p-2 text-red-200">
          error: {errorText}
        </div>
      )}
    </div>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
