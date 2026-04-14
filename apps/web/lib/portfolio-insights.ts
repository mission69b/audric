export interface InsightInput {
  idleUsdc: number;
  savings: number;
  savingsApy: number;
  total: number;
  debt: number;
  healthFactor: number | null;
  goals: Array<{ name: string; targetAmount: number; currentAmount: number; deadline?: string }>;
}

export function generatePortfolioInsights(input: InsightInput): string[] {
  const insights: string[] = [];

  if (input.idleUsdc > 5 && input.savingsApy > 0) {
    const annualEarn = input.idleUsdc * input.savingsApy;
    insights.push(
      `$${Math.floor(input.idleUsdc)} idle USDC in wallet. Saving it would earn ~$${annualEarn.toFixed(1)}/year at ${(input.savingsApy * 100).toFixed(1)}% APY.`,
    );
  }

  if (input.total > 0) {
    const usdcPct = input.total > 0 ? ((input.idleUsdc + input.savings) / input.total) * 100 : 0;
    if (usdcPct > 90) {
      insights.push('Portfolio concentrated in a single asset (USDC). No diversification exposure.');
    }
  }

  if (input.healthFactor != null && input.healthFactor < 2.0 && input.debt > 0) {
    insights.push(
      `Health factor at ${input.healthFactor.toFixed(1)} — approaching liquidation zone. Consider repaying some debt.`,
    );
  } else if (input.healthFactor != null && input.healthFactor >= 2.0 && input.debt > 0) {
    insights.push('Health factor is safe. No immediate liquidation risk.');
  }

  for (const goal of input.goals.slice(0, 1)) {
    if (goal.targetAmount > 0 && goal.currentAmount < goal.targetAmount) {
      const pct = (goal.currentAmount / goal.targetAmount) * 100;
      const remaining = goal.targetAmount - goal.currentAmount;
      insights.push(
        `${goal.name} goal is $${remaining.toFixed(0)} below target (${pct.toFixed(0)}% complete).`,
      );
    }
  }

  return insights.slice(0, 3);
}
