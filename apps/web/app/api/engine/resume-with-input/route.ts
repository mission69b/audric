import { NextRequest } from 'next/server';
import { serializeSSE } from '@t2000/engine';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { createEngine, getSessionStore } from '@/lib/engine/engine-factory';
import { sanitizeStreamErrorMessage } from '@/lib/engine/stream-errors';
import { getSessionSpend } from '@/lib/engine/session-spend';
import { prisma } from '@/lib/prisma';
import type { PendingInputSseEvent } from '@/lib/engine/sse-types';
import {
  validateValues,
  resolveRecipientField,
  persistAddRecipientContact,
  type ResolvedRecipient,
} from './route-helpers';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 9 v0.1.3 P9.4 — /api/engine/resume-with-input
//
// Resumes a turn that paused on a tool's `preflight → needsInput`. Symmetric
// with `/api/engine/resume` (which handles `pending_action` → user-confirm
// resumption) but resumes via `engine.resumeWithInput()` instead of
// `engine.resumeWithToolResult()`.
//
// Request shape
// ─────────────
// {
//   address: string,                  // Sui address (zkLogin)
//   sessionId: string,
//   pendingInput: PendingInput,       // FULL engine wire payload, echoed by client
//   values: Record<string, unknown>,  // Form values keyed on `field.name`
// }
//
// Auth: x-zklogin-jwt header (same gate as the rest of /api/engine/*).
//
// Side effects (BEFORE engine.resumeWithInput):
//   1. Validate the values against the schema (Zod-style + per-kind type checks).
//   2. For `sui-recipient` fields, normalize the polymorphic identifier
//      (Audric handle / SuiNS / 0x address) via `normalizeAddressInput`
//      and resolve to a canonical 0x. The engine receives the canonical
//      address as the field value.
//   3. When the resumed tool is `add_recipient`, persist the new contact
//      onto `UserPreferences.contacts` (JSON) BEFORE the engine resumes
//      so the resumed-turn's `<financial_context>` snapshot reflects
//      the new contact (mirrors the chat-route advice-log pattern).
//
// After side effects, the engine resumes the turn and the route streams
// events back as SSE — same shape as /api/engine/chat and /api/engine/resume.
//
// ⚠️ Engine version note
// ─────────────────────────────────────────────────
// `engine.resumeWithInput()` ships in @t2000/engine v1.19.0 (P9.6
// release — v1.18.0 was a no-op build). The route is ungated by env
// flag deliberately: it returns 404 to stale clients (no
// `pending_input` = no `pendingInput` payload) and only accepts wire
// shapes that v1.19.0 emits.
// ───────────────────────────────────────────────────────────────────────────

interface ResumeWithInputBody {
  address: string;
  sessionId: string;
  /** FULL engine wire payload — echoes back what the client received. */
  pendingInput: PendingInputSseEvent & {
    /** Discriminator field is the SSE wire `type`; engine accepts as `PendingInput`. */
    type: 'pending_input';
  };
  /** Submitted form values keyed on `field.name`. */
  values: Record<string, unknown>;
}

export const runtime = 'nodejs';
// Same 300s budget as /api/engine/resume — the resumed turn carries the
// post-input narration plus any chained tool calls.
export const maxDuration = 300;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Schema validation, sui-recipient resolution, and contact-persistence
// helpers live in `./route-helpers.ts`. Next.js 15 strict route-export
// validation rejects any non-HTTP-method / non-config export from a
// `route.ts` file, so we keep helpers in a sibling module and import them
// here + in `route.test.ts`.
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// POST handler.
// ───────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: ResumeWithInputBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { address, sessionId, pendingInput, values } = body;

  if (!address || !sessionId || !pendingInput?.inputId || !pendingInput?.toolName) {
    return jsonError('address, sessionId, and pendingInput are required', 400);
  }
  if (!values || typeof values !== 'object') {
    return jsonError('values must be an object', 400);
  }
  if (!isValidSuiAddress(address)) {
    return jsonError('Invalid Sui address', 400);
  }
  if (!pendingInput.schema?.fields || !Array.isArray(pendingInput.schema.fields)) {
    return jsonError('Invalid pendingInput.schema', 400);
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-resume-with-input:${ip}`, 20, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const validation = validateValues(pendingInput.schema, values);
  if (!validation.ok) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', fieldErrors: validation.errors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const finalValues: Record<string, unknown> = { ...validation.coerced };

  // Resolve every `sui-recipient` field. Stash the raw identifier on a
  // sidecar so add_recipient's persistence layer can record what the
  // user actually typed (vs. just the resolved canonical).
  const resolvedFrom: Record<string, ResolvedRecipient> = {};
  for (const field of pendingInput.schema.fields) {
    if (field.kind !== 'sui-recipient') continue;
    const raw = finalValues[field.name];
    if (typeof raw !== 'string' || raw === '') continue;
    const resolution = await resolveRecipientField(raw);
    if (!resolution.ok) {
      return new Response(
        JSON.stringify({
          error: 'Could not resolve recipient',
          fieldErrors: { [field.name]: resolution.error },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    finalValues[field.name] = resolution.value.canonical;
    resolvedFrom[field.name] = resolution.value;
  }

  // [P9.4 host fix] Fetch session BEFORE running side-effects. A 404
  // session would otherwise leave a persisted contact for a request
  // that can't actually resume — wasted DB write and a confusing
  // "ghost contact" if the user logs back in later.
  const store = getSessionStore();
  const session = await store.get(sessionId);
  if (!session) {
    return jsonError('Session not found', 404);
  }

  // Side-effect: persist the contact when the resumed tool is add_recipient.
  // Runs BEFORE engine resume so the resumed-turn's narration can reference
  // the just-saved contact (and its `<financial_context>` snapshot if the
  // host injects one).
  if (pendingInput.toolName === 'add_recipient') {
    const name = typeof finalValues.name === 'string' ? finalValues.name : null;
    const identifier =
      typeof finalValues.identifier === 'string' ? finalValues.identifier : null;
    const resolved = resolvedFrom.identifier;
    if (name && identifier && resolved) {
      try {
        // The form sends the raw identifier; we persist the raw alongside
        // the resolved canonical. The engine's tool input gets the
        // canonical (so its preflight passes), but we keep the raw so the
        // contact card displays "mom.audric.sui" not "0x40cd…3e62".
        await persistAddRecipientContact(address, name, resolved.raw, resolved);
      } catch (err) {
        // Persistence failure is non-fatal — the engine resume can still
        // narrate "Saved Mom" since the tool runs anyway. We just log.
        console.error('[resume-with-input] persistAddRecipientContact failed:', err);
      }
    }
  }

  const contacts = await prisma.userPreferences
    .findUnique({ where: { address }, select: { contacts: true } })
    .then((p) => (Array.isArray(p?.contacts) ? (p.contacts as Array<{ name: string; address: string }>) : []))
    .catch(() => []);

  // [P9.4 host fix] Pass the actual cumulative session spend so the
  // engine's USD-aware permission resolver enforces the daily cap on
  // the resumed-turn's writes. Hardcoded `0` would leak the spend
  // ceiling on any future `pending_input` tool that auto-executes a
  // sub-threshold write (add_recipient itself doesn't spend, but
  // SPEC 10+ may add tools that do).
  const sessionSpendUsd = await getSessionSpend(sessionId);

  try {
    const engine = await createEngine({
      address,
      session,
      contacts,
      sessionSpendUsd,
      sessionId,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const event of engine.resumeWithInput(pendingInput, finalValues)) {
            // [chat-route parity] `compaction` is an `EngineEvent` member but
            // NOT a `SSEEvent` member — host stashes the count then drops the
            // frame so it never reaches the wire. Mirrors the chat route
            // `case 'compaction': continue;` pattern.
            if (event.type === 'compaction') continue;
            // Engine-internal microcompact dedup marker — never serialize.
            if (event.type === 'tool_result' && event.toolName === '__deduped__') continue;
            if (event.type === 'error') {
              controller.enqueue(
                encoder.encode(
                  serializeSSE({
                    type: 'error',
                    message: sanitizeStreamErrorMessage(event.error.message),
                  }),
                ),
              );
            } else {
              controller.enqueue(encoder.encode(serializeSSE(event)));
            }
          }
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : 'Engine error';
          const errorMsg = sanitizeStreamErrorMessage(rawMsg);
          console.error('[engine/resume-with-input] stream error:', rawMsg);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
            ),
          );
        } finally {
          // Persist the post-resume session state so the next turn picks up
          // the assistant's narration + tool call results.
          try {
            const messages = [...engine.getMessages()];
            const usage = engine.getUsage();
            const updatedSession = {
              ...session,
              messages,
              usage,
              updatedAt: Date.now(),
            };
            await store.set(updatedSession);
          } catch (err) {
            console.error('[engine/resume-with-input] session save failed:', err);
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
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('[engine/resume-with-input] setup error:', err);
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

