import type {
  PortfolioSection,
  YieldEfficiencySection,
  ActivitySection,
  DetectedPattern,
  RiskSignal,
  AudricSuggestion,
} from './types';

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

export function detectPatterns(
  portfolio: PortfolioSection,
  yieldEff: YieldEfficiencySection,
  activity: ActivitySection,
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  if (yieldEff.idleStablesUsd >= 1) {
    patterns.push({
      id: 'idle_stables',
      label: 'Idle stables',
      description: `$${fmt(yieldEff.idleStablesUsd)} in stablecoins sitting in wallet without earning yield`,
      confidence: Math.min(1, yieldEff.idleStablesUsd / 10),
    });
  }

  if (activity.txCount30d >= 20) {
    patterns.push({
      id: 'active_defi_user',
      label: 'Active DeFi user',
      description: `${activity.txCount30d} transactions in the last 30 days`,
      confidence: Math.min(1, activity.txCount30d / 50),
    });
  }

  const topToken = portfolio.tokens[0];
  if (topToken && topToken.pct > 80 && portfolio.totalUsd > 1) {
    patterns.push({
      id: 'concentration_risk',
      label: 'Concentrated portfolio',
      description: `${topToken.pct.toFixed(0)}% allocated to ${topToken.symbol}`,
      confidence: topToken.pct / 100,
    });
  }

  if (portfolio.savings > 0 && yieldEff.weightedApy > 0) {
    patterns.push({
      id: 'yield_optimizer',
      label: 'Yield optimizer',
      description: `Already earning ${yieldEff.weightedApy.toFixed(2)}% APY on $${fmt(portfolio.savings)} in savings`,
      confidence: 0.9,
    });
  }

  if (portfolio.debt > 0) {
    patterns.push({
      id: 'borrower',
      label: 'Active borrower',
      description: `$${fmt(portfolio.debt)} in open debt positions`,
      confidence: 0.95,
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Risk signals
// ---------------------------------------------------------------------------

export function detectRiskSignals(
  portfolio: PortfolioSection,
  yieldEff: YieldEfficiencySection,
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  if (portfolio.healthFactor != null && portfolio.healthFactor < 2.0) {
    signals.push({
      id: 'low_hf',
      label: portfolio.healthFactor < 1.5 ? 'Health factor critical' : 'Health factor low',
      description: `Health factor is ${portfolio.healthFactor.toFixed(2)} — ${
        portfolio.healthFactor < 1.5
          ? 'liquidation risk is imminent'
          : 'consider repaying debt to improve safety margin'
      }`,
      severity: portfolio.healthFactor < 1.5 ? 'danger' : 'warning',
    });
  }

  if (yieldEff.idleStablesUsd >= 5 && portfolio.savings === 0) {
    signals.push({
      id: 'no_savings',
      label: 'No savings positions',
      description: `$${fmt(yieldEff.idleStablesUsd)} in stables but nothing deposited to earn yield`,
      severity: 'info',
    });
  }

  if (portfolio.debt > 0 && portfolio.savings > 0) {
    const ratio = portfolio.debt / portfolio.savings;
    if (ratio > 0.8) {
      signals.push({
        id: 'high_debt_ratio',
        label: 'High debt-to-savings ratio',
        description: `Debt is ${(ratio * 100).toFixed(0)}% of savings — a downturn could trigger issues`,
        severity: ratio > 1.2 ? 'danger' : 'warning',
      });
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// "Audric would do" pitch
// ---------------------------------------------------------------------------

const NAVI_USDC_APY = 4.5;

export function generateSuggestions(
  portfolio: PortfolioSection,
  yieldEff: YieldEfficiencySection,
  activity: ActivitySection,
): AudricSuggestion[] {
  const suggestions: AudricSuggestion[] = [];

  if (yieldEff.idleStablesUsd >= 1) {
    const monthlyYield = (yieldEff.idleStablesUsd * NAVI_USDC_APY) / 100 / 12;
    suggestions.push({
      id: 'save_idle',
      headline: `Save your idle $${fmt(yieldEff.idleStablesUsd)} USDC to earn ${NAVI_USDC_APY}% APY`,
      description: `Your stablecoins are sitting idle. Deposit into NAVI savings to start earning yield automatically.`,
      estimatedImpact: `~$${fmt(monthlyYield)}/month`,
      ctaLabel: 'Start earning',
    });
  }

  if (portfolio.healthFactor != null && portfolio.healthFactor < 2.5 && portfolio.debt > 0) {
    suggestions.push({
      id: 'monitor_hf',
      headline: `Monitor your health factor (currently ${portfolio.healthFactor.toFixed(2)}) 24/7`,
      description: `Get instant alerts before liquidation risk becomes critical — Audric watches your positions around the clock.`,
      estimatedImpact: 'Avoid liquidation',
      ctaLabel: 'Enable alerts',
    });
  }

  if (activity.txCount30d >= 10) {
    suggestions.push({
      id: 'automate_swaps',
      headline: 'Automate your regular transactions on a schedule',
      description: `You've made ${activity.txCount30d} transactions this month. Set up recurring saves, swaps, or repayments to save time.`,
      estimatedImpact: null,
      ctaLabel: 'Set up automation',
    });
  }

  if (portfolio.savings > 0) {
    suggestions.push({
      id: 'savings_goals',
      headline: 'Set savings goals and track progress automatically',
      description: `You have $${fmt(portfolio.savings)} saved. Create named goals with deadlines and let Audric track your progress.`,
      estimatedImpact: null,
      ctaLabel: 'Create a goal',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'get_started',
      headline: 'Get a personal financial agent for Sui',
      description: 'Audric tracks your portfolio, optimizes yield, automates transactions, and gives proactive financial advice — all through chat.',
      estimatedImpact: null,
      ctaLabel: 'Try Audric free',
    });
  }

  return suggestions.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : n.toFixed(2);
}
