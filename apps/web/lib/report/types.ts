export type RiskSeverity = 'info' | 'warning' | 'danger';

export interface TokenAllocation {
  symbol: string;
  amount: number;
  usd: number;
  pct: number;
}

export interface SupplyPosition {
  asset: string;
  amount: number;
  amountUsd: number;
  apy: number;
  protocol: string;
}

export interface BorrowPosition {
  asset: string;
  amount: number;
  amountUsd: number;
  apy: number;
  protocol: string;
}

export interface PortfolioSection {
  totalUsd: number;
  tokens: TokenAllocation[];
  savings: number;
  debt: number;
  netWorth: number;
  healthFactor: number | null;
  supplies: SupplyPosition[];
  borrows: BorrowPosition[];
}

export interface YieldEfficiencySection {
  earningUsd: number;
  idleStablesUsd: number;
  efficiencyPct: number;
  weightedApy: number;
  opportunityCostMonthly: number;
  estimatedDailyYield: number;
}

export interface ActivitySection {
  txCount30d: number;
  txCount90d: number;
  activeDays30d: number;
  lastActiveDate: string | null;
}

export interface DetectedPattern {
  id: string;
  label: string;
  description: string;
  confidence: number;
}

export interface RiskSignal {
  id: string;
  label: string;
  description: string;
  severity: RiskSeverity;
}

export interface AudricSuggestion {
  id: string;
  headline: string;
  description: string;
  estimatedImpact: string | null;
  ctaLabel: string;
}

export interface WalletReportData {
  address: string;
  generatedAt: string;
  portfolio: PortfolioSection;
  yieldEfficiency: YieldEfficiencySection;
  activity: ActivitySection;
  patterns: DetectedPattern[];
  riskSignals: RiskSignal[];
  audricWouldDo: AudricSuggestion[];
}
