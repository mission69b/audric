import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';

interface InferredProfile {
  riskAppetite?: 'conservative' | 'moderate' | 'aggressive';
  financialLiteracy?: 'novice' | 'intermediate' | 'advanced';
  prefersBriefResponses?: boolean;
  prefersExplainers?: boolean;
  currencyFraming?: 'usdc' | 'fiat';
  primaryGoals?: string[];
  knownPatterns?: string[];
  riskConfidence?: number;
  literacyConfidence?: number;
}

function buildInferencePrompt(
  messages: string[],
  existingProfile: InferredProfile | null,
): string {
  const existing = existingProfile
    ? `\nCurrent profile (update incrementally, don't overwrite without evidence):\n${JSON.stringify(existingProfile, null, 2)}\n`
    : '';

  return `Analyze these user messages from a financial agent conversation and infer a user profile.
${existing}
User messages (most recent last):
${messages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Return a JSON object with ONLY fields you have evidence for. Omit fields with insufficient signal.

Schema:
{
  "riskAppetite": "conservative" | "moderate" | "aggressive",
  "financialLiteracy": "novice" | "intermediate" | "advanced",
  "prefersBriefResponses": boolean,
  "prefersExplainers": boolean,
  "currencyFraming": "usdc" | "fiat",
  "primaryGoals": ["saving for X", "growing portfolio", ...],
  "knownPatterns": ["weekly DCA", "checks balance daily", ...],
  "riskConfidence": 0.0-1.0,
  "literacyConfidence": 0.0-1.0
}

Rules:
- riskAppetite: "conservative" = avoids debt/leverage, "aggressive" = borrows, seeks higher yields
- financialLiteracy: "novice" = asks basic questions, "advanced" = uses DeFi terms correctly
- Confidence scores: 0.0 = no signal, 1.0 = strong repeated evidence
- primaryGoals: extract stated financial goals (saving for trips, building emergency fund, etc)
- knownPatterns: extract behavioral patterns (checks daily, DCA schedule, etc)
- If updating existing profile, only change fields with new contradicting evidence

Return ONLY valid JSON, no markdown fences.`;
}

function parseProfileUpdate(raw: string): InferredProfile | null {
  try {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const result: InferredProfile = {};

    if (['conservative', 'moderate', 'aggressive'].includes(parsed.riskAppetite as string)) {
      result.riskAppetite = parsed.riskAppetite as InferredProfile['riskAppetite'];
    }
    if (['novice', 'intermediate', 'advanced'].includes(parsed.financialLiteracy as string)) {
      result.financialLiteracy = parsed.financialLiteracy as InferredProfile['financialLiteracy'];
    }
    if (typeof parsed.prefersBriefResponses === 'boolean') {
      result.prefersBriefResponses = parsed.prefersBriefResponses;
    }
    if (typeof parsed.prefersExplainers === 'boolean') {
      result.prefersExplainers = parsed.prefersExplainers;
    }
    if (['usdc', 'fiat'].includes(parsed.currencyFraming as string)) {
      result.currencyFraming = parsed.currencyFraming as 'usdc' | 'fiat';
    }
    if (Array.isArray(parsed.primaryGoals)) {
      result.primaryGoals = parsed.primaryGoals.filter((g): g is string => typeof g === 'string').slice(0, 10);
    }
    if (Array.isArray(parsed.knownPatterns)) {
      result.knownPatterns = parsed.knownPatterns.filter((p): p is string => typeof p === 'string').slice(0, 10);
    }
    if (typeof parsed.riskConfidence === 'number' && parsed.riskConfidence >= 0 && parsed.riskConfidence <= 1) {
      result.riskConfidence = parsed.riskConfidence;
    }
    if (typeof parsed.literacyConfidence === 'number' && parsed.literacyConfidence >= 0 && parsed.literacyConfidence <= 1) {
      result.literacyConfidence = parsed.literacyConfidence;
    }

    if (Object.keys(result).length === 0) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * POST /api/internal/profile-inference
 * Called by the t2000 cron to infer/update a user's financial profile.
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const logs = await prisma.conversationLog.findMany({
    where: {
      userId,
      role: 'user',
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { content: true },
  });

  if (logs.length < 5) {
    return NextResponse.json({ skipped: true, reason: 'insufficient_data' });
  }

  const messages = logs
    .map((l) => l.content)
    .filter((c) => c.length > 10 && c.length < 2000);

  if (messages.length < 5) {
    return NextResponse.json({ skipped: true, reason: 'insufficient_prose' });
  }

  const existingProfile = await prisma.userFinancialProfile.findUnique({
    where: { userId },
  });

  const existing: InferredProfile | null = existingProfile
    ? {
        riskAppetite: existingProfile.riskAppetite as InferredProfile['riskAppetite'],
        financialLiteracy: existingProfile.financialLiteracy as InferredProfile['financialLiteracy'],
        prefersBriefResponses: existingProfile.prefersBriefResponses,
        prefersExplainers: existingProfile.prefersExplainers,
        currencyFraming: existingProfile.currencyFraming as 'usdc' | 'fiat',
        primaryGoals: existingProfile.primaryGoals,
        knownPatterns: existingProfile.knownPatterns,
        riskConfidence: existingProfile.riskConfidence,
        literacyConfidence: existingProfile.literacyConfidence,
      }
    : null;

  const prompt = buildInferencePrompt(messages, existing);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'enabled', budget_tokens: 2048 },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[profile-inference] Anthropic API error for ${userId}: ${msg}`);
    return NextResponse.json({ error: 'Anthropic API error', detail: msg }, { status: 502 });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'No text in response' }, { status: 500 });
  }

  const update = parseProfileUpdate(textBlock.text);
  if (!update) {
    return NextResponse.json({ error: 'Failed to parse profile' }, { status: 500 });
  }

  const data = {
    ...update,
    lastInferredAt: new Date(),
    inferenceVersion: (existingProfile?.inferenceVersion ?? 0) + 1,
  };

  await prisma.userFinancialProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  return NextResponse.json({ updated: true, fields: Object.keys(update) });
}
