export type ChainFactType =
  | 'deposit_pattern'
  | 'risk_profile'
  | 'yield_behavior'
  | 'borrow_behavior'
  | 'near_liquidation'
  | 'large_transaction'
  | 'compounding_streak';

export interface ChainFact {
  type: ChainFactType;
  fact: string;
  confidence: number;
  derivedAt: Date;
  source: 'app_event' | 'snapshot';
}

/**
 * Minimal shape for AppEvent records passed to classifiers.
 * Classifiers receive pre-fetched arrays — no Prisma dependency.
 */
export interface AppEventRecord {
  type: string;
  title: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Minimal shape for PortfolioSnapshot records passed to classifiers.
 */
export interface SnapshotRecord {
  date: Date;
  walletValueUsd: number;
  savingsValueUsd: number;
  debtValueUsd: number;
  netWorthUsd: number;
  yieldEarnedUsd: number;
  healthFactor: number | null;
}
