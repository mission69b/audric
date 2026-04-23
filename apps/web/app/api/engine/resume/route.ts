import { NextRequest } from 'next/server';
import { engineToSSE } from '@t2000/engine';
import type { PendingAction } from '@t2000/engine';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { createEngine, getSessionStore, setConversationState } from '@/lib/engine/engine-factory';
import { logSessionUsage } from '@/lib/engine/log-session-usage';
import { getSessionSpend, incrementSessionSpend } from '@/lib/engine/session-spend';
import { applyModificationsToAction, resolveOutcome } from '@/lib/engine/apply-modifications';
import {
  resolveUsdValue,
  toolNameToOperation,
} from '@/lib/engine/permission-tiers-client';
import { prisma } from '@/lib/prisma';

const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-20250514';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ResumeRequestBody {
  address: string;
  sessionId: string;
  action: PendingAction;
  approved: boolean;
  executionResult?: unknown;
  /**
   * [v1.4 Item 4] Coarse outcome stored on the originating
   * `TurnMetrics.pendingActionOutcome` row so analytics can compute
   * approve / decline / modify ratios per tool. Optional: defaults to
   * `approved` / `declined` from the boolean if omitted.
   */
  outcome?: 'approved' | 'declined' | 'modified';
  /**
   * [v1.4 Item 6] Subset of `action.input` keys the user edited via the
   * permission card's modifiable-field controls. Overlaid onto
   * `action.input` before reconstructing the turn so the recorded history
   * matches what was actually approved.
   */
  modifications?: Record<string, unknown>;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let body: ResumeRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { address, sessionId, action: rawAction, approved, executionResult, outcome, modifications } = body;

  // [v1.4 Item 6] Overlay user modifications on top of action.input so the
  // engine reconstructs the turn with the approved values. The shared helper
  // also handles the no-modifications case as identity for ref-equality.
  const action: PendingAction = applyModificationsToAction(rawAction, modifications);
  const resolvedOutcome = resolveOutcome(approved, modifications, outcome);

  if (!address || !sessionId || !action?.toolUseId) {
    return jsonError('address, sessionId, and action are required', 400);
  }

  if (!isValidSuiAddress(address)) {
    return jsonError('Invalid Sui address', 400);
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-resume:${ip}`, 20, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  const session = await store.get(sessionId);

  if (!session) {
    return jsonError('Session not found', 404);
  }

  const contacts = await prisma.userPreferences.findUnique({ where: { address }, select: { contacts: true } })
    .then((p) => (Array.isArray(p?.contacts) ? p.contacts as Array<{ name: string; address: string }> : []))
    .catch(() => []);

  try {
    // [v1.4] Forward cumulative session spend so the resumed turn enforces
    // the daily autonomous cap on any subsequent auto-tier write tools.
    const sessionSpendUsd = await getSessionSpend(sessionId);

    const engine = await createEngine({
      address,
      session,
      contacts,
      sessionSpendUsd,
      sessionId,
    });
    const priorMsgCount = engine.getMessages().length;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let pendingAction: PendingAction | null = null;

        try {
          for await (const chunk of engineToSSE(
            engine.resumeWithToolResult(action, { approved, executionResult }),
          )) {
            controller.enqueue(encoder.encode(chunk));

            if (chunk.includes('"type":"pending_action"')) {
              try {
                const match = chunk.match(/data: (.+)/);
                if (match) {
                  const parsed = JSON.parse(match[1]);
                  if (parsed.type === 'pending_action') {
                    pendingAction = parsed.action;
                  }
                }
              } catch { /* best effort */ }
            }
          }
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : 'Engine error';
          console.error('[engine/resume] stream error:', errorMsg);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
            ),
          );
        } finally {
          const messages = [...engine.getMessages()];
          const usage = engine.getUsage();

          try {
            const updatedSession = {
              ...session,
              messages,
              usage,
              updatedAt: Date.now(),
              pendingAction,
            };
            await store.set(updatedSession);
          } catch (saveErr) {
            console.error('[engine/resume] session save failed:', saveErr);
          }

          // F4: Update conversation state — if resume produced a new
          // pending action (chained write), transition to awaiting_confirmation;
          // otherwise reset to idle.
          if (pendingAction) {
            setConversationState(sessionId, {
              type: 'awaiting_confirmation',
              action: pendingAction.toolName,
              amount: typeof (pendingAction.input as Record<string, unknown>)?.amount === 'number'
                ? (pendingAction.input as Record<string, unknown>).amount as number
                : undefined,
              proposedAt: Date.now(),
              expiresAt: Date.now() + 5 * 60_000,
            }).catch((err) =>
              console.error('[engine/resume] state transition failed:', err),
            );
          } else {
            setConversationState(sessionId, { type: 'idle' }).catch((err) =>
              console.error('[engine/resume] state transition failed:', err),
            );
          }

          logSessionUsage(address, sessionId, usage, messages, AGENT_MODEL, priorMsgCount).catch((err) =>
            console.error('[engine/resume] session usage log failed:', err),
          );

          // [v1.4 Item 6] Update the originating `TurnMetrics` row with
          // the resolved outcome (approved / declined / modified). Keyed
          // on `(sessionId, turnIndex)` from `PendingAction.turnIndex`.
          prisma.turnMetrics
            .updateMany({
              where: { sessionId, turnIndex: action.turnIndex },
              data: { pendingActionOutcome: resolvedOutcome },
            })
            .catch((err) =>
              console.warn('[TurnMetrics] pendingActionOutcome update failed (non-fatal):', err),
            );

          // [v1.4 hotfix] Audric signs writes client-side, so the
          // engine's `onAutoExecuted → incrementSessionSpend` callback
          // never fires (the engine yields a pending_action and the
          // client executes). To make the v1.4 daily autonomous cap
          // real we increment the Redis counter here, on every approved
          // client-executed write that didn't error. USDC/USDT writes
          // are valued at amount; non-stable writes need a price cache
          // — that's only available inside the engine, so we pass an
          // empty cache and let `resolveUsdValue` fall through to
          // Infinity, which the next-turn permission resolver treats
          // as "definitely confirm" (failing safe).
          if (
            resolvedOutcome === 'approved' || resolvedOutcome === 'modified'
          ) {
            const op = toolNameToOperation(action.toolName);
            const looksSuccessful =
              executionResult == null ||
              !(
                typeof executionResult === 'object' &&
                executionResult !== null &&
                ('success' in executionResult
                  ? (executionResult as { success?: unknown }).success === false
                  : false)
              );
            if (op && looksSuccessful) {
              const usd = resolveUsdValue(
                action.toolName,
                (action.input as Record<string, unknown>) ?? {},
                new Map<string, number>([['USDC', 1], ['USDT', 1]]),
              );
              if (Number.isFinite(usd) && usd > 0) {
                incrementSessionSpend(sessionId, usd).catch((err) =>
                  console.warn('[session-spend] increment failed (non-fatal):', err),
                );
              }
            }
          }

          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Engine resume failed';
    console.error('[engine/resume] init error:', errorMsg);
    return jsonError(errorMsg, 500);
  }
}
