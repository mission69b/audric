export type PatternType =
  | 'recurring_save'
  | 'yield_reinvestment'
  | 'debt_discipline'
  | 'idle_usdc_tolerance'
  | 'swap_pattern';

export interface ProposedAction {
  toolName: string;
  params: Record<string, unknown>;
  schedule?: string;
  trigger?: { type: string; threshold: number };
}

export interface BehavioralPattern {
  type: PatternType;
  confidence: number;
  observations: number;
  lastSeen: Date;
  proposalText: string;
  proposedAction: ProposedAction;
}
