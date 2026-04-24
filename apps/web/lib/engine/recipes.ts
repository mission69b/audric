import { RecipeRegistry } from '@t2000/engine';

/**
 * Embedded recipe YAML strings — bundled at build time so they work in
 * serverless environments without filesystem access to t2000-skills/.
 */

const SWAP_AND_SAVE = `
name: swap_and_save
description: Swap a token to USDC and deposit into savings
triggers:
  - "swap and save"
  - "convert and deposit"
  - "swap to USDC then save"
  - "move everything to savings"
steps:
  - name: check_balance
    tool: balance_check
    purpose: Get current token balances
    gate: none
    on_error:
      action: retry
      message: "Balance check failed. Retrying once."
  - name: swap_to_usdc
    tool: swap_execute
    purpose: Swap source token to USDC
    requires:
      - step: check_balance
        field: available_amount
    gate: estimate
    on_error:
      action: abort
      message: "Swap failed. No deposit attempted. Your original balance is unchanged."
  - name: deposit
    tool: save_deposit
    purpose: Deposit received USDC into savings
    requires:
      - step: swap_to_usdc
        field: received
    gate: none
    on_error:
      action: report
      message: "Swap succeeded but deposit failed. Your USDC is in your wallet."
`;

const SAFE_BORROW = `
name: safe_borrow
description: Borrow USDC with health factor validation
triggers:
  - "borrow"
  - "take out a loan"
  - "borrow against"
steps:
  - name: check_health
    tool: health_check
    purpose: Get current health factor and max borrow capacity
    gate: none
    on_error:
      action: abort
      message: "Cannot check health factor. Refusing borrow."
  - name: evaluate_risk
    purpose: Assess whether borrowing is safe
    gate: review
    rules:
      - "If health factor after borrow < 1.5: refuse with reason"
      - "If health factor after borrow 1.5-2.0: warn, require explicit confirmation"
      - "Always state: borrow amount, interest rate, projected health factor"
    on_error:
      action: refuse
      message: "Health factor too low. Refusing to protect from liquidation."
      suggest: "Repay existing debt or deposit more collateral first."
  - name: execute_borrow
    tool: borrow
    purpose: Execute the borrow
    requires:
      - step: evaluate_risk
      - confirmation: true
    on_error:
      action: abort
      message: "Borrow transaction failed. No funds were moved."
`;

const SEND_TO_CONTACT = `
name: send_to_contact
description: Send tokens to a saved contact or new address
triggers:
  - "send to"
  - "transfer to"
  - "send USDC to"
  - "pay to"
steps:
  - name: resolve_recipient
    purpose: Resolve the recipient from contacts or validate raw address
    gate: none
    rules:
      - "If user gives a name: match against contacts list"
      - "If user gives an address: validate with isValidSuiAddress()"
      - "If ambiguous: ask the user to clarify"
  - name: check_balance
    tool: balance_check
    purpose: Verify sufficient funds
    gate: none
    on_error:
      action: retry
      message: "Balance check failed. Retrying once."
  - name: execute_send
    tool: send_transfer
    purpose: Send the tokens
    requires:
      - step: resolve_recipient
      - step: check_balance
        field: sufficient_funds
    gate: none
    on_error:
      action: abort
      message: "Transfer failed. No funds were moved."
  - name: offer_save_contact
    purpose: If recipient was a raw address, offer to save as contact
    gate: none
    condition: "recipient was not already a contact"
`;

const PORTFOLIO_REBALANCE = `
name: portfolio_rebalance
description: Rebalance portfolio to target allocation
triggers:
  - "rebalance"
  - "rebalance my portfolio"
  - "adjust my allocation"
steps:
  - name: check_positions
    tool: balance_check
    purpose: Get current portfolio breakdown
    gate: none
    on_error:
      action: retry
      message: "Balance check failed. Retrying once."
  - name: plan_trades
    purpose: Calculate required swaps to reach target allocation
    gate: review
    rules:
      - "Show current allocation vs target allocation"
      - "List each swap with estimated amounts"
      - "Calculate total slippage across all swaps"
  - name: execute_swaps
    tool: swap_execute
    purpose: Execute each swap in sequence
    requires:
      - step: plan_trades
        confirmation: true
    notes: "Execute one swap at a time. Check balance after each."
    on_error:
      action: report
      message: "Partial rebalance — some swaps completed. Check balance for current state."
  - name: summary
    purpose: Report final positions
    tool: balance_check
`;

const ACCOUNT_REPORT = `
name: account_report
description: Render a complete account snapshot — six rich cards covering wallet, savings, debt, activity, yield, and portfolio
triggers:
  - "full report"
  - "full account report"
  - "account report"
  - "account summary"
  - "give me everything"
  - "complete overview"
  - "show me everything"
  - "everything about my account"
  - "full overview"
steps:
  - name: render_balance_card
    tool: balance_check
    purpose: Render the BALANCE CHECK card (wallet, savings, debt, total)
    gate: none
    notes: "REQUIRED — even if portfolio_analysis returns the same data, this tool call is what renders the BALANCE CHECK card. Skipping it = missing card."
  - name: render_savings_card
    tool: savings_info
    purpose: Render the SAVINGS INFO card (positions, supply/borrow APY, daily earnings)
    gate: none
    notes: "REQUIRED — renders the SAVINGS INFO card with per-position breakdown."
  - name: render_health_card
    tool: health_check
    purpose: Render the HEALTH CHECK card (HF, supplied, borrowed, max borrow, liq threshold)
    gate: none
    notes: "REQUIRED — renders the HEALTH CHECK card."
  - name: render_activity_card
    tool: activity_summary
    purpose: Render the ACTIVITY SUMMARY card (monthly tx breakdown by category)
    gate: none
    notes: "REQUIRED — renders the ACTIVITY SUMMARY card."
  - name: render_yield_card
    tool: yield_summary
    purpose: Render the YIELD SUMMARY card (today/week/month/all-time earnings, APY, projected yearly)
    gate: none
    notes: "REQUIRED — renders the YIELD SUMMARY card."
  - name: render_portfolio_card
    tool: portfolio_analysis
    purpose: Render the PORTFOLIO ANALYSIS card (allocation %, week change, insights)
    gate: none
    notes: "REQUIRED — renders the PORTFOLIO ANALYSIS card."
  - name: write_headline
    purpose: After all six cards render, write a 2-3 sentence headline summarizing net worth, health factor, and the single biggest opportunity
    gate: none
    rules:
      - "Lead with net worth and weekly change."
      - "Mention health factor in one phrase."
      - "End with the single most actionable insight (idle USDC, debt, etc)."
      - "Do NOT narrate the cards' contents — they render themselves. Do NOT list asset percentages, APYs, or savings positions in prose."
      - "Maximum 3 sentences total."
`;

const EMERGENCY_WITHDRAW = `
name: emergency_withdraw
description: Safely withdraw from savings while managing health factor
triggers:
  - "withdraw everything"
  - "emergency withdraw"
  - "close my position"
steps:
  - name: check_health
    tool: health_check
    purpose: Check health factor and outstanding borrows
    gate: none
    on_error:
      action: abort
      message: "Cannot check health data. Refusing emergency withdraw."
  - name: evaluate_safety
    purpose: Determine safe withdrawal amount
    gate: review
    rules:
      - "If borrows > 0: calculate max safe withdrawal that keeps health > 1.5"
      - "If no borrows: full withdrawal is safe"
      - "Warn user about goal impact if active goals exist"
    on_error:
      action: refuse
      message: "Cannot determine safe withdrawal amount."
      suggest: "Try repaying some debt first."
  - name: execute_withdraw
    tool: withdraw
    purpose: Withdraw the safe amount
    requires:
      - step: evaluate_safety
        confirmation: true
    on_error:
      action: abort
      message: "Withdrawal failed. No funds were moved."
`;

let _registry: RecipeRegistry | null = null;

export function getRecipeRegistry(): RecipeRegistry {
  if (_registry) return _registry;

  _registry = new RecipeRegistry();
  for (const yaml of [SWAP_AND_SAVE, SAFE_BORROW, SEND_TO_CONTACT, PORTFOLIO_REBALANCE, EMERGENCY_WITHDRAW, ACCOUNT_REPORT]) {
    _registry.loadYaml(yaml);
  }
  return _registry;
}
