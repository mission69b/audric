import { NextRequest } from 'next/server';
import {
  serializeSSE,
  normalizeAddressInput,
  resolveAddressToSuinsViaRpc,
} from '@t2000/engine';
import type { Prisma } from '@/lib/generated/prisma/client';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { createEngine, getSessionStore } from '@/lib/engine/engine-factory';
import { sanitizeStreamErrorMessage } from '@/lib/engine/stream-errors';
import { getSessionSpend } from '@/lib/engine/session-spend';
import { prisma } from '@/lib/prisma';
import type {
  FormSchema,
  PendingInputSseEvent,
} from '@/lib/engine/sse-types';

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
// Schema validation — defense-in-depth against client tampering. The form
// renderer enforces these rules client-side, but the server still re-checks
// to keep the engine's preflight contract honest.
// ───────────────────────────────────────────────────────────────────────────

interface ValidationResult {
  ok: boolean;
  /** Per-field error map keyed on `field.name`. */
  errors: Record<string, string>;
  /** Coerced values (numbers parsed, strings trimmed). */
  coerced: Record<string, unknown>;
}

function validateValues(schema: FormSchema, values: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  const coerced: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const raw = values[field.name];

    if (field.required && (raw == null || raw === '')) {
      errors[field.name] = 'Required';
      continue;
    }

    if (raw == null || raw === '') continue;

    switch (field.kind) {
      case 'number':
      case 'usd': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) {
          errors[field.name] = 'Must be a number';
          continue;
        }
        coerced[field.name] = n;
        break;
      }

      case 'select': {
        const s = String(raw);
        const allowed = (field.options ?? []).map((o) => o.value);
        if (allowed.length > 0 && !allowed.includes(s)) {
          errors[field.name] = 'Not a valid option';
          continue;
        }
        coerced[field.name] = s;
        break;
      }

      case 'date': {
        const s = String(raw);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          errors[field.name] = 'Must be YYYY-MM-DD';
          continue;
        }
        coerced[field.name] = s;
        break;
      }

      case 'sui-recipient':
      case 'text':
      default: {
        const s = String(raw).trim();
        if (s === '') {
          if (field.required) errors[field.name] = 'Required';
          continue;
        }
        coerced[field.name] = s;
        break;
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, coerced };
}

// ───────────────────────────────────────────────────────────────────────────
// `sui-recipient` resolution — runs AFTER schema validation, BEFORE
// engine.resumeWithInput. Calls `normalizeAddressInput` (S.52) to coerce
// the polymorphic identifier into a canonical 0x address. For external
// SuiNS / Audric handles this hits NAVI's RPC for the lookup.
//
// The resolved canonical address replaces the user-typed string in the
// values payload — the engine's tool sees an address-shaped string. The
// raw identifier is preserved on a side-channel `_resolvedFrom[<field>]`
// key for tools that want to render "Saved Mom (mom.audric.sui →
// 0xabc…)" in their displayText.
//
// Audric-handle reverse-lookup: SPEC 10 D7's unified Contact shape
// includes `audricUsername`. When the identifier is a 0x address (no
// SuiNS associated), we attempt a reverse lookup to populate the
// `audricUsername` so the persisted contact stays SPEC 10-compliant.
// ───────────────────────────────────────────────────────────────────────────

interface ResolvedRecipient {
  raw: string;
  canonical: string;
  audricUsername?: string;
}

async function resolveRecipientField(
  raw: string,
): Promise<{ ok: true; value: ResolvedRecipient } | { ok: false; error: string }> {
  try {
    const normalized = await normalizeAddressInput(raw);
    // Best-effort SuiNS reverse lookup — populates audricUsername when the
    // input was a bare 0x. Failure is non-fatal: the contact persists
    // without the SuiNS sidecar; SPEC 10's lazy-backfill cron fills it in.
    //
    // The engine helper returns `string[]` (multiple SuiNS names can map
    // to one address); we take the first as the canonical reverse name.
    // If the input was already a SuiNS, `normalized.suinsName` already
    // carries it — we prefer that over the reverse-lookup result.
    let audricUsername: string | undefined = normalized.suinsName ?? undefined;
    if (!audricUsername) {
      try {
        const reverse = await resolveAddressToSuinsViaRpc(normalized.address);
        if (Array.isArray(reverse) && reverse.length > 0) {
          audricUsername = reverse[0];
        }
      } catch {
        // swallow — backfill cron handles
      }
    }
    return {
      ok: true,
      value: {
        raw,
        canonical: normalized.address,
        audricUsername,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not resolve recipient',
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Contact persistence — only fires when the resumed tool is `add_recipient`.
// Upserts onto `UserPreferences.contacts` (JSON column).
//
// The persisted shape is the SPEC 10 D7 unified Contact:
//   { name, identifier, resolvedAddress, audricUsername?, addedAt, source }
// Existing contacts in the JSON blob may be the legacy `{ name, address }`
// shape — we don't migrate them here. The reading code that consumes
// `contacts` (engine `ToolContext.contacts`, transfer-asset-casing, etc.)
// already handles both shapes.
// ───────────────────────────────────────────────────────────────────────────

interface UnifiedContactRow {
  name: string;
  identifier: string;
  resolvedAddress: string;
  audricUsername?: string;
  addedAt: number;
  source: 'agent' | 'manual';
}

async function persistAddRecipientContact(
  address: string,
  name: string,
  identifier: string,
  resolved: ResolvedRecipient,
): Promise<void> {
  // [P9.4 host fix] Conditionally include audricUsername. If the
  // current resolution didn't yield one (most identifiers won't), we
  // must NOT spread `audricUsername: undefined` — on the dedupe-merge
  // path below, the spread would clobber an existing audricUsername
  // that an earlier resolution had captured.
  const newContact: UnifiedContactRow = {
    name,
    identifier,
    resolvedAddress: resolved.canonical,
    ...(resolved.audricUsername ? { audricUsername: resolved.audricUsername } : {}),
    addedAt: Date.now(),
    source: 'agent',
  };

  // Read-modify-write on the JSON column. Concurrent agent + chip-flow
  // adds for the same wallet are rare; if they ever clash, the second
  // write wins (prior contact still exists keyed by `name`).
  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { contacts: true },
  });
  const existing = Array.isArray(prefs?.contacts)
    ? (prefs.contacts as Array<Record<string, unknown>>)
    : [];

  // Dedupe on (case-insensitive name) — avoids agent re-adding a contact
  // the user already saved manually. First match wins.
  const dupIdx = existing.findIndex(
    (c) => typeof c.name === 'string' && c.name.toLowerCase() === name.toLowerCase(),
  );
  let nextContacts: Array<Record<string, unknown>>;
  if (dupIdx >= 0) {
    // Update the existing row in place so the nickname survives but the
    // resolved address picks up any SuiNS reverse-lookup now available.
    nextContacts = existing.map((c, i) => (i === dupIdx ? { ...c, ...newContact } : c));
  } else {
    nextContacts = [...existing, newContact as unknown as Record<string, unknown>];
  }

  await prisma.userPreferences.upsert({
    where: { address },
    update: { contacts: nextContacts as Prisma.InputJsonValue },
    create: {
      address,
      contacts: nextContacts as Prisma.InputJsonValue,
    },
  });
}

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

// ───────────────────────────────────────────────────────────────────────────
// Re-exports for tests
// ───────────────────────────────────────────────────────────────────────────

export const __testables = {
  validateValues,
  resolveRecipientField,
  persistAddRecipientContact,
};

