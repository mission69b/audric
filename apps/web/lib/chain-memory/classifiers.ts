import type { ChainFact, AppEventRecord, SnapshotRecord } from './types';

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

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function extractAmountUsd(event: AppEventRecord): number | null {
  const d = event.details;
  if (!d) return null;
  if (typeof d.amountUsd === 'number') return d.amountUsd;
  if (typeof d.amount === 'number') return d.amount;
  return null;
}

// ---------------------------------------------------------------------------
// 1. Deposit pattern — "deposits consistently on Fridays"
// ---------------------------------------------------------------------------

export function classifyDepositPattern(events: AppEventRecord[]): ChainFact | null {
  const saves = events.filter((e) => e.type === 'save');
  if (saves.length < 3) return null;

  const amounts = saves.map((e) => extractAmountUsd(e) ?? 0).filter((a) => a > 0);
  if (amounts.length < 3) return null;

  const med = median(amounts);
  if (med === 0) return null;
  const amountConsistent = amounts.every((a) => Math.abs(a - med) / med < 0.2);
  if (!amountConsistent) return null;

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

  return {
    type: 'deposit_pattern',
    fact: `Deposits ~$${Math.floor(med)} consistently on ${dayName(mostCommonDay)}s (${saves.length} occurrences)`,
    confidence,
    derivedAt: new Date(),
    source: 'app_event',
  };
}

// ---------------------------------------------------------------------------
// 2. Risk profile — "conservative / moderate / near-liquidation"
// ---------------------------------------------------------------------------

export function classifyRiskProfile(snapshots: SnapshotRecord[]): ChainFact | null {
  const hfValues = snapshots
    .map((s) => s.healthFactor)
    .filter((hf): hf is number => hf !== null && hf > 0);

  if (hfValues.length < 7) return null;

  const minHF = Math.min(...hfValues);
  const avgHF = hfValues.reduce((a, b) => a + b, 0) / hfValues.length;
  const confidence = hfValues.length > 14 ? 0.9 : 0.6;

  let fact: string;
  if (minHF > 2.5) {
    fact = `Conservative risk profile — health factor never below ${minHF.toFixed(2)}, avg ${avgHF.toFixed(2)}`;
  } else if (minHF < 1.6) {
    fact = `Has experienced near-liquidation risk — HF reached ${minHF.toFixed(2)}`;
  } else {
    fact = `Moderate risk tolerance — avg HF ${avgHF.toFixed(2)}, min ${minHF.toFixed(2)}`;
  }

  return { type: 'risk_profile', fact, confidence, derivedAt: new Date(), source: 'snapshot' };
}

// ---------------------------------------------------------------------------
// 3. Yield behavior — "compounds" or "reinvests"
// ---------------------------------------------------------------------------

export function classifyYieldBehavior(
  events: AppEventRecord[],
  snapshots: SnapshotRecord[],
): ChainFact | null {
  if (snapshots.length < 7) return null;

  const withdrawals = events.filter((e) => e.type === 'withdraw');
  const claims = events.filter((e) => e.type === 'claim_rewards');
  const savingsGrowing = snapshots.length >= 2 &&
    snapshots[snapshots.length - 1].savingsValueUsd > snapshots[0].savingsValueUsd;

  if (withdrawals.length === 0 && savingsGrowing) {
    return {
      type: 'yield_behavior',
      fact: 'Never withdraws savings — lets yield compound over time',
      confidence: snapshots.length > 14 ? 0.85 : 0.6,
      derivedAt: new Date(),
      source: 'snapshot',
    };
  }

  if (claims.length >= 2) {
    const saves = events.filter((e) => e.type === 'save');
    const claimDates = new Set(claims.map((e) => e.createdAt.toISOString().slice(0, 10)));
    const redeposits = saves.filter((e) =>
      claimDates.has(e.createdAt.toISOString().slice(0, 10)),
    );

    if (redeposits.length >= 2) {
      return {
        type: 'yield_behavior',
        fact: `Actively reinvests yield — claimed and re-deposited ${redeposits.length} times`,
        confidence: 0.8,
        derivedAt: new Date(),
        source: 'app_event',
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 4. Borrow behavior — "borrows and repays within N days"
// ---------------------------------------------------------------------------

export function classifyBorrowBehavior(events: AppEventRecord[]): ChainFact | null {
  const borrows = events.filter((e) => e.type === 'borrow');
  const repays = events.filter((e) => e.type === 'repay');

  if (borrows.length < 2 || repays.length < 2) return null;

  const repayWindows: number[] = [];
  const usedRepays = new Set<number>();

  for (const b of borrows) {
    const nextRepay = repays.findIndex(
      (r, i) => !usedRepays.has(i) && r.createdAt > b.createdAt,
    );
    if (nextRepay !== -1) {
      usedRepays.add(nextRepay);
      const days = (repays[nextRepay].createdAt.getTime() - b.createdAt.getTime()) / 86_400_000;
      repayWindows.push(days);
    }
  }

  if (repayWindows.length < 2) return null;

  const avgDays = Math.round(repayWindows.reduce((a, b) => a + b, 0) / repayWindows.length);
  const confidence = repayWindows.length >= 3 ? 0.85 : 0.65;

  return {
    type: 'borrow_behavior',
    fact: `Borrowed ${borrows.length} times, repaid within ~${avgDays} days on average`,
    confidence,
    derivedAt: new Date(),
    source: 'app_event',
  };
}

// ---------------------------------------------------------------------------
// 5. Near liquidation — "HF dropped to 1.4 on [date]"
// ---------------------------------------------------------------------------

export function classifyNearLiquidation(snapshots: SnapshotRecord[]): ChainFact | null {
  const critical = snapshots.filter(
    (s) => s.healthFactor !== null && s.healthFactor > 0 && s.healthFactor < 1.5,
  );

  if (critical.length === 0) return null;

  const worst = critical.reduce((min, s) =>
    (s.healthFactor! < min.healthFactor!) ? s : min,
  );

  const dateStr = worst.date.toISOString().slice(0, 10);

  return {
    type: 'near_liquidation',
    fact: `Health factor dropped to ${worst.healthFactor!.toFixed(2)} on ${dateStr} — near-liquidation risk`,
    confidence: 0.95,
    derivedAt: new Date(),
    source: 'snapshot',
  };
}

// ---------------------------------------------------------------------------
// 6. Large transactions — "largest single deposit: $500"
// ---------------------------------------------------------------------------

export function classifyLargeTransactions(events: AppEventRecord[]): ChainFact | null {
  const withAmounts = events
    .map((e) => ({ event: e, amount: extractAmountUsd(e) }))
    .filter((x): x is { event: AppEventRecord; amount: number } =>
      x.amount !== null && x.amount > 0,
    );

  if (withAmounts.length === 0) return null;

  const largest = withAmounts.reduce((max, x) => (x.amount > max.amount ? x : max));

  if (largest.amount < 10) return null;

  const dateStr = largest.event.createdAt.toISOString().slice(0, 10);

  return {
    type: 'large_transaction',
    fact: `Largest single transaction: $${Math.floor(largest.amount)} (${largest.event.type}) on ${dateStr}`,
    confidence: 0.95,
    derivedAt: new Date(),
    source: 'app_event',
  };
}

// ---------------------------------------------------------------------------
// 7. Compounding streak — "savings grew for N consecutive months"
// ---------------------------------------------------------------------------

export function classifyCompoundingStreak(snapshots: SnapshotRecord[]): ChainFact | null {
  if (snapshots.length < 14) return null;

  const byMonth = new Map<string, number[]>();
  for (const s of snapshots) {
    const key = monthKey(s.date);
    const arr = byMonth.get(key) ?? [];
    arr.push(s.savingsValueUsd);
    byMonth.set(key, arr);
  }

  const monthlyAvg = [...byMonth.entries()]
    .map(([key, vals]) => ({
      month: key,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (monthlyAvg.length < 2) return null;

  let streak = 0;
  let maxStreak = 0;
  for (let i = 1; i < monthlyAvg.length; i++) {
    if (monthlyAvg[i].avg > monthlyAvg[i - 1].avg) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  if (maxStreak < 2) return null;

  return {
    type: 'compounding_streak',
    fact: `Savings grew for ${maxStreak} consecutive months — consistent compounding`,
    confidence: Math.min(0.9, 0.6 + maxStreak * 0.1),
    derivedAt: new Date(),
    source: 'snapshot',
  };
}

// ---------------------------------------------------------------------------
// Aggregate runner — run all classifiers and collect results
// ---------------------------------------------------------------------------

export function runAllClassifiers(
  events: AppEventRecord[],
  snapshots: SnapshotRecord[],
): ChainFact[] {
  const facts: (ChainFact | null)[] = [
    classifyDepositPattern(events),
    classifyRiskProfile(snapshots),
    classifyYieldBehavior(events, snapshots),
    classifyBorrowBehavior(events),
    classifyNearLiquidation(snapshots),
    classifyLargeTransactions(events),
    classifyCompoundingStreak(snapshots),
  ];

  return facts.filter((f): f is ChainFact => f !== null);
}
