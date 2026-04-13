import type { AppEventRecord, SnapshotRecord } from './types';
import type { BehavioralPattern } from './pattern-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function dayOfWeek(date: Date): number {
  return date.getUTCDay();
}

function dayName(dow: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
}

function extractAmountUsd(event: AppEventRecord): number | null {
  const d = event.details;
  if (!d) return null;
  if (typeof d.amountUsd === 'number') return d.amountUsd;
  if (typeof d.amount === 'number') return d.amount;
  return null;
}

function extractAsset(event: AppEventRecord): string | null {
  const d = event.details;
  if (!d) return null;
  if (typeof d.asset === 'string') return d.asset;
  return null;
}

function extractTargetAsset(event: AppEventRecord): string | null {
  const d = event.details;
  if (!d) return null;
  if (typeof d.targetAsset === 'string') return d.targetAsset;
  return null;
}

function cronForDay(dow: number): string {
  return `0 9 * * ${dow}`;
}

// ---------------------------------------------------------------------------
// 1. Recurring save — 3+ saves with consistent amount and day-of-week
// ---------------------------------------------------------------------------

export function detectRecurringSave(events: AppEventRecord[]): BehavioralPattern | null {
  const saves = events.filter((e) => e.type === 'save');
  if (saves.length < 3) return null;

  const amounts = saves.map((e) => extractAmountUsd(e) ?? 0).filter((a) => a > 0);
  if (amounts.length < 3) return null;

  const med = median(amounts);
  if (med === 0) return null;

  const amountConsistent = amounts.filter((a) => Math.abs(a - med) / med < 0.2).length;
  if (amountConsistent / amounts.length < 0.7) return null;

  const days = saves.map((e) => dayOfWeek(e.createdAt));
  const freq = new Map<number, number>();
  for (const d of days) freq.set(d, (freq.get(d) ?? 0) + 1);

  let mostCommonDay = 0;
  let maxCount = 0;
  for (const [d, c] of freq) {
    if (c > maxCount) { mostCommonDay = d; maxCount = c; }
  }

  const dayConsistency = maxCount / saves.length;
  if (dayConsistency < 0.7) return null;

  const confidence = Math.min(0.95, 0.6 + saves.length * 0.05);
  const roundedAmount = Math.floor(med);

  return {
    type: 'recurring_save',
    confidence,
    observations: saves.length,
    lastSeen: saves[saves.length - 1].createdAt,
    proposalText: `I noticed you save ~$${roundedAmount} every ${dayName(mostCommonDay)}. Want me to automate that?`,
    proposedAction: {
      toolName: 'save_deposit',
      params: { amount: roundedAmount, asset: 'USDC' },
      schedule: cronForDay(mostCommonDay),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Yield reinvestment — claim_rewards followed by save on same day, 2+ times
// ---------------------------------------------------------------------------

export function detectYieldReinvestment(events: AppEventRecord[]): BehavioralPattern | null {
  const claims = events.filter((e) => e.type === 'claim_rewards');
  const saves = events.filter((e) => e.type === 'save');

  if (claims.length < 2) return null;

  const claimDates = new Set(
    claims.map((e) => e.createdAt.toISOString().slice(0, 10)),
  );
  const redeposits = saves.filter((e) =>
    claimDates.has(e.createdAt.toISOString().slice(0, 10)),
  );

  if (redeposits.length < 2) return null;

  const amounts = redeposits
    .map((e) => extractAmountUsd(e) ?? 0)
    .filter((a) => a > 0);
  const avgAmount = amounts.length > 0
    ? Math.floor(amounts.reduce((a, b) => a + b, 0) / amounts.length)
    : 10;

  const confidence = Math.min(0.9, 0.65 + redeposits.length * 0.05);

  return {
    type: 'yield_reinvestment',
    confidence,
    observations: redeposits.length,
    lastSeen: redeposits[redeposits.length - 1].createdAt,
    proposalText: `You reinvest your yield after claiming rewards (${redeposits.length} times). Should I auto-compound for you?`,
    proposedAction: {
      toolName: 'save_deposit',
      params: { amount: avgAmount, asset: 'USDC' },
      trigger: { type: 'claim_rewards', threshold: 0 },
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Debt discipline — borrow/repay pairs where repay within 7 days, 2+ pairs
// ---------------------------------------------------------------------------

export function detectDebtDiscipline(events: AppEventRecord[]): BehavioralPattern | null {
  const borrows = events.filter((e) => e.type === 'borrow');
  const repays = events.filter((e) => e.type === 'repay');

  if (borrows.length < 2 || repays.length < 2) return null;

  const usedRepays = new Set<number>();
  const pairs: { borrowDate: Date; repayDate: Date; days: number; amount: number }[] = [];

  for (const b of borrows) {
    const nextRepayIdx = repays.findIndex(
      (r, i) => !usedRepays.has(i) && r.createdAt > b.createdAt,
    );
    if (nextRepayIdx !== -1) {
      usedRepays.add(nextRepayIdx);
      const days = (repays[nextRepayIdx].createdAt.getTime() - b.createdAt.getTime()) / 86_400_000;
      if (days <= 7) {
        const amount = extractAmountUsd(repays[nextRepayIdx]) ?? 0;
        pairs.push({ borrowDate: b.createdAt, repayDate: repays[nextRepayIdx].createdAt, days, amount });
      }
    }
  }

  if (pairs.length < 2) return null;

  const avgDays = Math.round(pairs.reduce((sum, p) => sum + p.days, 0) / pairs.length);
  const avgAmount = Math.floor(pairs.reduce((sum, p) => sum + p.amount, 0) / pairs.length);
  const confidence = Math.min(0.9, 0.6 + pairs.length * 0.1);

  return {
    type: 'debt_discipline',
    confidence,
    observations: pairs.length,
    lastSeen: pairs[pairs.length - 1].repayDate,
    proposalText: `You repay debt within ~${avgDays} days of borrowing (${pairs.length} times). Want me to auto-repay when your balance allows?`,
    proposedAction: {
      toolName: 'repay_debt',
      params: { amount: avgAmount, asset: 'USDC' },
      trigger: { type: 'borrow_age_days', threshold: avgDays },
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Idle USDC tolerance — avg idle USDC < $20 (user invests quickly)
// ---------------------------------------------------------------------------

export function detectIdleUsdcTolerance(snapshots: SnapshotRecord[]): BehavioralPattern | null {
  if (snapshots.length < 7) return null;

  const hasSavings = snapshots.some((s) => s.savingsValueUsd > 0);
  if (!hasSavings) return null;

  const idleUsdc = snapshots.map((s) => {
    const walletNonSavings = s.walletValueUsd - s.debtValueUsd;
    return Math.max(0, walletNonSavings);
  });

  const avgIdle = idleUsdc.reduce((a, b) => a + b, 0) / idleUsdc.length;
  if (avgIdle >= 20) return null;

  const savingsAvg = snapshots.reduce((a, b) => a + b.savingsValueUsd, 0) / snapshots.length;
  if (savingsAvg < 10) return null;

  const confidence = Math.min(0.85, 0.6 + (snapshots.length / 30) * 0.1);

  return {
    type: 'idle_usdc_tolerance',
    confidence,
    observations: snapshots.length,
    lastSeen: snapshots[snapshots.length - 1].date,
    proposalText: `You keep very little idle USDC (avg ~$${Math.floor(avgIdle)}). Want me to auto-save USDC above a threshold?`,
    proposedAction: {
      toolName: 'save_deposit',
      params: { asset: 'USDC', keepReserve: 20 },
      trigger: { type: 'idle_usdc_above', threshold: 50 },
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Swap pattern — regular SUI-to-USDC (or other) swaps on consistent cadence
// ---------------------------------------------------------------------------

export function detectSwapPattern(events: AppEventRecord[]): BehavioralPattern | null {
  const swaps = events.filter((e) => e.type === 'swap');
  if (swaps.length < 3) return null;

  const pairFreq = new Map<string, AppEventRecord[]>();
  for (const s of swaps) {
    const from = extractAsset(s) ?? 'unknown';
    const to = extractTargetAsset(s) ?? 'unknown';
    const key = `${from}->${to}`;
    const arr = pairFreq.get(key) ?? [];
    arr.push(s);
    pairFreq.set(key, arr);
  }

  let bestPair = '';
  let bestEvents: AppEventRecord[] = [];
  for (const [pair, evts] of pairFreq) {
    if (evts.length > bestEvents.length) {
      bestPair = pair;
      bestEvents = evts;
    }
  }

  if (bestEvents.length < 3) return null;

  const amounts = bestEvents.map((e) => extractAmountUsd(e) ?? 0).filter((a) => a > 0);
  const med = median(amounts);

  const days = bestEvents.map((e) => dayOfWeek(e.createdAt));
  const freq = new Map<number, number>();
  for (const d of days) freq.set(d, (freq.get(d) ?? 0) + 1);

  let mostCommonDay = 0;
  let maxCount = 0;
  for (const [d, c] of freq) {
    if (c > maxCount) { mostCommonDay = d; maxCount = c; }
  }

  const dayConsistency = maxCount / bestEvents.length;
  if (dayConsistency < 0.5) return null;

  const [fromAsset, toAsset] = bestPair.split('->');
  const roundedAmount = med > 0 ? Math.floor(med) : 50;
  const confidence = Math.min(0.9, 0.55 + bestEvents.length * 0.05);

  return {
    type: 'swap_pattern',
    confidence,
    observations: bestEvents.length,
    lastSeen: bestEvents[bestEvents.length - 1].createdAt,
    proposalText: `You swap ${fromAsset} to ${toAsset} regularly (~$${roundedAmount} on ${dayName(mostCommonDay)}s). Want me to automate this?`,
    proposedAction: {
      toolName: 'swap_execute',
      params: { fromAsset, toAsset, amount: roundedAmount },
      schedule: cronForDay(mostCommonDay),
    },
  };
}

// ---------------------------------------------------------------------------
// Aggregate runner — run all detectors
// ---------------------------------------------------------------------------

export function runAllDetectors(
  events: AppEventRecord[],
  snapshots: SnapshotRecord[],
): BehavioralPattern[] {
  const patterns: (BehavioralPattern | null)[] = [
    detectRecurringSave(events),
    detectYieldReinvestment(events),
    detectDebtDiscipline(events),
    detectIdleUsdcTolerance(snapshots),
    detectSwapPattern(events),
  ];

  return patterns.filter((p): p is BehavioralPattern => p !== null);
}
