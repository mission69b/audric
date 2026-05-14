import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { redactPII } from '@/lib/log-redact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const MAX_MEMORIES = 50;
const JACCARD_THRESHOLD = 0.7;

type MemoryType = 'preference' | 'fact' | 'pattern' | 'goal' | 'concern';

interface ExtractedMemory {
  memoryType: MemoryType;
  content: string;
  originalQuote?: string;
  confidence: number;
  expiresInDays?: number;
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function buildExtractionPrompt(
  messages: string[],
  existingMemories: { content: string; memoryType: string }[],
): string {
  const existingBlock = existingMemories.length > 0
    ? `\nExisting memories (avoid duplicates):\n${existingMemories.map((m) => `- [${m.memoryType}] ${m.content}`).join('\n')}\n`
    : '';

  return `Extract memorable facts, preferences, patterns, goals, and concerns from these user messages.
${existingBlock}
User messages (most recent last):
${messages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Return a JSON array of memories. Each memory:
{
  "memoryType": "preference" | "fact" | "pattern" | "goal" | "concern",
  "content": "brief statement (max 200 chars)",
  "originalQuote": "verbatim user quote if available",
  "confidence": 0.0-1.0,
  "expiresInDays": null | number
}

Types:
- preference: "Prefers short responses", "Likes to see charts"
- fact: "Lives in Tokyo", "Has 3 savings accounts"
- pattern: "Checks balance every morning", "DCA $50 weekly"
- goal: "Saving for trip to Japan", "Building emergency fund"
- concern: "Worried about liquidation risk", "Uncertain about borrowing"

Rules:
- Only extract things the user explicitly stated or strongly implied
- Skip generic/common statements ("I want to save money")
- Skip duplicate or near-duplicate memories from the existing list
- Max 10 memories per extraction
- confidence < 0.5 = too uncertain, skip it
- Temporary facts (visiting a city) should have expiresInDays

Return ONLY valid JSON array, no markdown fences. Empty array [] if no memories found.`;
}

function parseMemories(raw: string): ExtractedMemory[] {
  try {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown[];

    if (!Array.isArray(parsed)) return [];

    const validTypes = new Set(['preference', 'fact', 'pattern', 'goal', 'concern']);

    return parsed
      .filter((m): m is Record<string, unknown> =>
        typeof m === 'object' && m !== null &&
        typeof (m as Record<string, unknown>).memoryType === 'string' &&
        typeof (m as Record<string, unknown>).content === 'string',
      )
      .filter((m) => validTypes.has(m.memoryType as string))
      .filter((m) => (m.content as string).length <= 200)
      .filter((m) => typeof m.confidence === 'number' && m.confidence >= 0.5)
      .slice(0, 10)
      .map((m) => ({
        memoryType: m.memoryType as MemoryType,
        content: m.content as string,
        originalQuote: typeof m.originalQuote === 'string' ? m.originalQuote : undefined,
        confidence: m.confidence as number,
        expiresInDays: typeof m.expiresInDays === 'number' ? m.expiresInDays : undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * POST /api/internal/memory-extraction
 * Called by the t2000 cron to extract memories from a user's conversations.
 * Body: { userId: string }
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body?.userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const { userId } = body as { userId: string };

  // Cursor-based windowing: only process logs since last extraction
  const lastMemory = await prisma.userMemory.findFirst({
    where: { userId },
    orderBy: { extractedAt: 'desc' },
    select: { extractedAt: true },
  });

  const since = lastMemory?.extractedAt ?? new Date(0);

  // Fetch most recent messages first, then reverse for chronological order
  const logsDesc = await prisma.conversationLog.findMany({
    where: {
      userId,
      role: 'user',
      createdAt: { gt: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { content: true },
  });
  const logs = logsDesc.reverse();

  if (logs.length < 3) {
    return NextResponse.json({ skipped: true, reason: 'insufficient_data' });
  }

  const messages = logs
    .map((l) => l.content)
    .filter((c) => c.length > 10 && c.length < 2000);

  if (messages.length < 3) {
    return NextResponse.json({ skipped: true, reason: 'insufficient_prose' });
  }

  const existingMemories = await prisma.userMemory.findMany({
    where: { userId, active: true },
    select: { content: true, memoryType: true },
    orderBy: { extractedAt: 'desc' },
  });

  const prompt = buildExtractionPrompt(messages, existingMemories);

  const apiKey = env.ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // [SPEC 30 1B.5 follow-up — 2026-05-14] Truncate `userId` for log
    // safety. See `lib/log-redact.ts` for the threat model.
    const { userId: redactedUserId } = redactPII({ userId });
    console.error(`[memory-extraction] Anthropic API error for ${redactedUserId}: ${msg}`);
    return NextResponse.json({ error: 'Anthropic API error', detail: msg }, { status: 502 });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'No text in response' }, { status: 500 });
  }

  const extracted = parseMemories(textBlock.text);
  if (extracted.length === 0) {
    return NextResponse.json({ extracted: 0 });
  }

  // Dedup against existing memories using Jaccard similarity
  const deduped = extracted.filter((m) =>
    !existingMemories.some((em) => jaccardSimilarity(m.content, em.content) > JACCARD_THRESHOLD),
  );

  if (deduped.length === 0) {
    return NextResponse.json({ extracted: 0, reason: 'all_duplicates' });
  }

  // Soft-expire stale memories
  await prisma.userMemory.updateMany({
    where: {
      userId,
      active: true,
      expiresAt: { lte: new Date() },
    },
    data: { active: false },
  });

  // Check memory cap
  const activeCount = await prisma.userMemory.count({
    where: { userId, active: true },
  });

  const slotsAvailable = Math.max(0, MAX_MEMORIES - activeCount);
  const toInsert = deduped.slice(0, slotsAvailable);

  if (toInsert.length > 0) {
    await prisma.userMemory.createMany({
      data: toInsert.map((m) => ({
        userId,
        memoryType: m.memoryType,
        content: m.content,
        originalQuote: m.originalQuote ?? null,
        confidence: m.confidence,
        // [SPEC 30 D-12 — 2026-05-14] Default `expiresAt` enforcement.
        // Per the D-12 lock: "UserMemory: enforce default 365d
        // expiresAt, explicit no-expiry only when confidence > 0.9
        // (high-conviction extracted facts)." When the LLM provides
        // an explicit `expiresInDays`, honor it. When no explicit
        // expiry AND confidence ≤ 0.9, default to 365d. When no
        // explicit expiry AND confidence > 0.9, leave null (the
        // memory persists until the user deletes it manually).
        expiresAt: m.expiresInDays
          ? new Date(Date.now() + m.expiresInDays * 86_400_000)
          : m.confidence > 0.9
            ? null
            : new Date(Date.now() + 365 * 86_400_000),
        active: true,
      })),
    });
  }

  return NextResponse.json({ extracted: toInsert.length });
}
