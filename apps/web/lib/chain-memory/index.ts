export type {
  ChainFact,
  ChainFactType,
  AppEventRecord,
  SnapshotRecord,
} from './types';

// [SIMPLIFICATION DAY 12.5] pattern-detectors + pattern-types removed
// (~715 LOC). Detectors emitted BehavioralPattern proposals consumed only by
// the deleted Copilot autonomy stack. Classifiers stay — they emit ChainFact
// rows that the chain-memory cron writes for the agent to read silently.
export {
  classifyDepositPattern,
  classifyRiskProfile,
  classifyYieldBehavior,
  classifyBorrowBehavior,
  classifyNearLiquidation,
  classifyLargeTransactions,
  classifyCompoundingStreak,
  runAllClassifiers,
} from './classifiers';
