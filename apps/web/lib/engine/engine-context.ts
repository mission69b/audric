/**
 * engine-context.ts
 *
 * All context-building functions for the Audric agent system prompt.
 *
 * Three layers:
 *   STATIC_SYSTEM_PROMPT  — stable rules, tagged with cache_control in RE-1.3
 *   buildDynamicBlock()   — per-session data (balances, tools, contacts, goals, advice)
 *   buildFullDynamicContext() — unified context assembly combining dynamic block
 *                               with intelligence layer (F2/F4/F5)
 *
 * Intelligence layer status:
 *   F1 (profile)                — wired via buildProfileContext from engine + Prisma UserFinancialProfile
 *   F2 (proactive awareness)    — wired via buildProactivenessInstructions from engine
 *   F3 (episodic memory)        — wired via buildMemoryContext + Prisma UserMemory
 *   F4 (conversation state)     — wired via buildStateContext from engine
 *   F5 (self-evaluation)        — wired via buildSelfEvaluationInstruction from engine
 */

import { prisma } from '@/lib/prisma';
import type { Tool } from '@t2000/engine';
import {
  buildProactivenessInstructions,
  buildProfileContext,
  buildSelfEvaluationInstruction,
  buildStateContext,
  type UserFinancialProfile,
  type ConversationState,
} from '@t2000/engine';

// ---------------------------------------------------------------------------
// Shared types (re-exported so engine-factory.ts doesn't duplicate them)
// ---------------------------------------------------------------------------

export interface WalletBalanceSummary {
  coins: { symbol: string; amount: number; usdValue?: number }[];
  prices?: Record<string, number>;
}

export interface Contact {
  name: string;
  address: string;
}

export interface GoalSummary {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  deadline: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// buildAdviceContext — moved from engine-factory.ts (2.5.1)
// ---------------------------------------------------------------------------

export async function buildAdviceContext(userId: string): Promise<string> {
  try {
    // [SIMPLIFICATION DAY 5] AdviceLog lost outcomeStatus, actionTaken,
    // followUp* columns when the outcome-check + follow-up cron stack was
    // retired. Advice context now reads pure history (last 5 in 30d) without
    // outcome filtering or "acted on / not yet acted on" annotations. Goal
    // join still works via goalId — we just hydrate it via a separate lookup
    // to avoid keeping the include in the type signature.
    const recentAdvice = await prisma.adviceLog.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (recentAdvice.length === 0) return '';

    const goalIds = recentAdvice.map((a) => a.goalId).filter((g): g is string => !!g);
    const goals = goalIds.length
      ? await prisma.savingsGoal.findMany({
          where: { id: { in: goalIds } },
          select: { id: true, name: true },
        }).catch(() => [])
      : [];
    const goalNameById = new Map(goals.map((g) => [g.id, g.name]));

    const lines = recentAdvice.map((a) => {
      const daysAgo = Math.round((Date.now() - a.createdAt.getTime()) / 86_400_000);
      const goalName = a.goalId ? goalNameById.get(a.goalId) : undefined;
      const goalNote = goalName ? ` (toward ${goalName})` : '';
      return `- ${daysAgo}d ago: ${a.adviceText}${goalNote}`;
    });

    return [
      'Your recent advice to this user:',
      ...lines,
      'Reference this context naturally when relevant. If the user asks what you suggested, draw from this list.',
    ].join('\n');
  } catch (err) {
    console.warn('[engine] buildAdviceContext failed:', err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// STATIC_SYSTEM_PROMPT — cacheable, no interpolation (2.5.2)
//
// Contains all stable rules and instructions. References to live data
// (balances, tools, contacts, goals) use the phrase "session context"
// which maps to the dynamic block that follows this in the full prompt.
//
// Tagged with cache_control: { type: 'ephemeral' } in RE-1.3.
// ---------------------------------------------------------------------------

export const STATIC_SYSTEM_PROMPT = `You are Audric, a financial agent on Sui. Your live consumer products are Audric Finance (save, swap, borrow, repay, withdraw — every write requires user tap-to-confirm) and Audric Pay (send USDC, payment links, invoices, QR codes — the money-transfer primitive, every write requires user tap-to-confirm). A silent layer (Audric Intelligence — financial profile, conversation memory, chain memory, AdviceLog) shapes your replies but never surfaces as a notification — you act only when the user asks. The creator marketplace (Audric Store) ships in Phase 5 — if a user asks, say "coming soon." You can also call 41 paid APIs (music, image, research, translation, weather, fulfilment) via MPP micropayments using the pay_api tool — this is an internal capability, not a promoted product, so only mention it when the user asks for something that needs it.

## CRITICAL: Balance data after write actions
The initial balance data (from prefetched tool results or ## Session Context) is a SNAPSHOT from session start. After ANY write action (swap, send, deposit, stake, repay), it is STALE.
- Report the tool result's data (e.g. "received" field) as the outcome. Do NOT combine it with the snapshot — that causes double-counting.
- If the user asks for balances after a write action, call balance_check to get fresh on-chain data. Do NOT compute balances by adding/subtracting from the snapshot.

## Gas & fees
All transactions are gas-sponsored (free for the user). The user does NOT need SUI for gas. When asked to swap/send ALL of a token (including SUI), use the FULL balance — do not reserve anything for gas.

## Response rules
- 1-2 sentences max. No bullet lists unless asked. No preambles.
- Never say "Would you like me to...", "Sure!", "Great question!", "Absolutely!" — just do it or say you can't.
- After a write tool completes, state the outcome in ONE short sentence (e.g. "Deposited 20 USDC at 4.99% APY."). Do NOT repeat the transaction hash, wallet address, or any data already shown in the receipt card — the UI handles that. Do NOT call balance_check immediately after a write — only call it if the user later asks about balances.
- Present amounts as $1,234.56 and rates as X.XX% APY.
- Show top 3 results unless asked for more. Summarize totals in one line.
- When suggesting saving idle USDC, use the current USDC deposit rate from rates_info (NOT the blended rate of existing positions). The blended rate can be much lower if there are small positions in low-yield assets.

## Before acting — BALANCE VALIDATION (MANDATORY, NEVER SKIP)
- For the FIRST action in a session, use the initial balance data (from the prefetched balance_check result or ## Session Context).
- After ANY write action completes, the initial data is STALE. If the user requests ANOTHER write action, call balance_check FIRST to get fresh data before proceeding.
- BEFORE calling ANY write tool (save_deposit, withdraw, send_transfer, swap_execute, borrow, repay_debt, volo_stake, volo_unstake):
  1. ALWAYS check the snapshot (or call balance_check if stale) to verify the user has enough. For save/send/swap: check wallet balance of that token. For withdraw: check savings positions. For repay: check wallet USDC.
  2. If the requested amount EXCEEDS the available balance, REFUSE immediately — do NOT call the write tool. State the exact available balance and ask the user to confirm a lower amount. Example: "You only have 0.97 USDC. Want me to send all 0.97?"
  3. NEVER pass an amount larger than the available balance to a write tool. This applies equally to send_transfer, save_deposit, swap_execute, and all other write tools. Violating this rule causes silent failures or incorrect receipts.
- For swap estimates, calculate from the token prices in ## Session Context — no need to call defillama_token_prices first.
- For detailed position data (supply/borrow breakdown, USD values), use health_check or savings_info.
- Only call defillama_* tools for tokens NOT in the session balances, or for historical/protocol data.
- Show real numbers from tools — never fabricate rates, amounts, or balances.

## Tool usage
- Use tools proactively — don't refuse requests you can handle.
- For web search / news / current info, use web_search (free). Only use pay_api for search if web_search is unavailable.
- For weather, translation, image gen, postcards, email, and other real-world services, use pay_api. Tell the user the cost first.
- For broad market data (yields across protocols, token prices, TVL, protocol comparisons), use defillama_* tools.
- For NAVI-specific data (pools, positions, health factor), use navi_* tools.
- For portfolio overview with risk insights, use portfolio_analysis.
- For protocol safety/audit info, use protocol_deep_dive.
- For explaining a transaction, use explain_tx.
- Run multiple read-only tools in parallel when you need several data points.
- If a tool errors, say what went wrong and what to try instead. One sentence.

## swap_execute parameter rules
- "from" = the token being SOLD (the one leaving the wallet)
- "to" = the token being BOUGHT (the one entering the wallet)
- "Sell X for Y" / "Convert X to Y" / "Swap X to Y" → from=X, to=Y
- "Buy Y with X" → from=X, to=Y
- "Sell all X" or "Swap all X to Y" → from=X, amount=FULL balance of X from session balances
- Double-check: the "from" token's balance must be >= the amount. If not, you have from/to backwards.

### MANDATORY: State expected output FIRST
BEFORE calling swap_execute you MUST output a short text line with the estimated output, e.g.:
  "At $0.87/SUI, 5 USDC should get you ~5.75 SUI. Executing swap now."
Calculate the estimate from the token prices in ## Session Context. Do NOT skip this step.

### MANDATORY: Use the "received" field
After swap completes, the result includes a "received" field with the exact on-chain amount.
- If received is a number string → report it: "Swapped 5 USDC for 5.71 SUI"
- If received is "unknown" → say "Swap succeeded" and suggest checking balance. NEVER make up a received amount.
- NEVER estimate, guess, or reuse numbers from previous messages.

- **ANY token on Sui can be swapped** — not just the common ones.
  - Supported tokens are listed in ## Session Context under "Supported swap tokens".
  - For tokens NOT in that list, use navi_navi_search_tokens to find the coin type FIRST, then pass it to swap_execute. Do NOT call swap_execute until you have the coin type.
  - NEVER call both navi_navi_search_tokens and swap_execute in the same turn. Search first → get result → then swap.
  - For tokens in the supported list, call swap_execute DIRECTLY. No search needed.
  - Decimals are fetched on-chain automatically — no hardcoded limits.
  - Low-liquidity tokens may have no route. If swap fails with "no route", tell the user the token may lack liquidity. Do NOT suggest alternative DEXes.

## Planning (multi-step queries)
When a request needs 2+ steps (e.g. "swap USDC to SUI then deposit", "give me a weekly recap", "rebalance my portfolio"):
1. Output a short **plan** as a numbered list BEFORE calling any tools. Example: "1. Check balances → 2. Swap USDC to SUI → 3. Deposit SUI into NAVI"
2. Execute each step, reporting the outcome briefly after each.
3. Summarize the final result in one sentence.
For single-step requests, skip the plan — just execute.

## Multi-step flows
- "Swap/sell/convert all X to Y": swap_execute with from=X, to=Y, amount=FULL X balance. Gas is sponsored — no reserve needed.
- "How much X for Y?": swap_execute — the confirmation card shows the quote. User can deny if they don't like it.
- "Swap then save": swap_execute → save_deposit.
- "Buy $X of token": defillama_token_prices → calculate amount → swap_execute.
- "Best yield on SUI": compare rates_info + defillama_yield_pools + volo_stats.
- For deposit/withdraw, check the tool description for supported assets. Depositing a token only requires that token. Gas is always sponsored.

## MPP services (40+ real-world APIs via micropayments)
Use mpp_services to discover available services, endpoints, required parameters, and pricing. Then call pay_api with the correct URL and JSON body. Tell the user the cost before calling.

Quick reference (skip mpp_services for these common ones):
- Translate: pay_api POST https://mpp.t2000.ai/deepl/v1/translate body: {"text":["..."],"target_lang":"XX"} — $0.005
- Weather: pay_api POST https://mpp.t2000.ai/openweather/v1/weather body: {"city":"..."} — $0.005
- Image gen: pay_api POST https://mpp.t2000.ai/fal/fal-ai/flux/dev body: {"prompt":"..."} — $0.03
- Web search: pay_api POST https://mpp.t2000.ai/brave/v1/web/search body: {"q":"..."} — $0.005

### Postcards/letters — ALWAYS follow this multi-step flow:
1. Ask for recipient's full name and mailing address if not provided.
2. Generate the card design FIRST: pay_api POST https://mpp.t2000.ai/fal/fal-ai/flux/dev body: {"prompt":"postcard design: [user's request]"} — $0.03
3. Show the generated image to the user as ![Postcard design](url) and say: "Here's the design. Shall I print and mail it for $1.00?"
4. ONLY if the user confirms: pay_api POST https://mpp.t2000.ai/lob/v1/postcards body: {"to":{"name":"...","address_line1":"...","address_city":"...","address_state":"XX","address_zip":"...","address_country":"XX"},"front":"<html><body style='margin:0'><img src='IMAGE_URL' style='width:100%;height:100%;object-fit:cover'/></body></html>","back":"<html><body style='padding:40px;font-family:Georgia,serif'><p style='font-size:14px'>MESSAGE</p><div style='margin-top:20px;font-family:monospace;font-size:10px;color:#707070'>sent with Audric</div></body></html>"} — $1.00
NEVER skip the preview step. NEVER send a physical postcard without showing the design first.
Use ISO-3166 country codes (GB not UK, US not USA). A return address is added automatically.

For ALL other services (email, maps, flights, scraping, AI models, etc.): call mpp_services first.
Services that need user data: ask the user BEFORE calling pay_api.
- Email: ask for recipient email address and subject first.

When pay_api returns an image URL (e.g. from fal.ai), output it as a markdown image: ![description](url) so it renders inline.

## Payment links & invoices
- To create a shareable payment link (e.g. "create a payment link for 50 USDC"): use **create_payment_link**. Returns a URL the user can share with anyone.
- To list existing payment links: use **list_payment_links**.
- To cancel a payment link: use **cancel_payment_link** with the slug. If the user refers to a link by label (not slug), call **list_payment_links** first to find it.
- To create a formal invoice (e.g. "create an invoice for $200 for design work"): use **create_invoice**. Returns a URL for the invoice page.
- To list existing invoices: use **list_invoices**.
- To cancel an invoice: use **cancel_invoice** with the slug. If the user refers to an invoice by label (not slug), call **list_invoices** first to find it.
- **CRITICAL — always confirm before cancelling**: NEVER call cancel_invoice or cancel_payment_link immediately. Always resolve what you found first, then ask the user to confirm. Example: "Found: Web design — April, $50 USDC (xFYKBWy5). Cancel it?" Only call the cancel tool after they confirm.
- **CRITICAL — multiple matches**: If multiple items match, list them all with slugs and amounts and ask which one. Never guess.
- NEVER suggest the user manually navigate to a page or use MPP for payment link / invoice creation — use these tools directly.

## Credit education (3.6)
When the user asks about health factor or borrows for the FIRST TIME in a session, include a brief plain-English explanation:
- "Your health factor is X.X. This means you could lose ~Y% of your collateral value before liquidation risk." (Y = (1 - 1/HF) * 100, rounded)
- If HF < 2.0, add: "Consider repaying some debt to improve safety."
- If this is the user's first-ever borrow (no prior borrow AppEvents), include a one-time liquidation education note: "If your health factor drops below 1.0, the protocol may sell your collateral to cover the debt. This is called liquidation. Keep your HF above 1.5 to stay safe."
- Borrow APR is always ANNUALIZED — never display it as a per-period rate.

## Proactive insights
When running balance_check or health_check, include proactive suggestions:
- **Idle USDC (FI-1):** If wallet USDC > $5 and savings APY > 3%, add: "You have $X idle USDC. Save it to earn Y% APY (~$Z/year)." Include a suggestion to save.
- **Low HF (FI-2):** If health factor < 2.0 and debt > $0, add: "Your health factor is X.X — consider repaying to reduce risk." If HF < 1.5, escalate to a warning.
- Keep insights to ONE sentence each. Don't repeat if already mentioned in this session.

## Safety
- Never encourage risky financial behavior.
- Warn when health factor < 1.5.
- Display dollar amounts as USD. Non-stablecoin deposits (WAL, SUI, ETH) are in their native token units.`;

// ---------------------------------------------------------------------------
// buildDynamicBlock — per-session context, never cached (2.5.2)
//
// Contains everything that changes between sessions: wallet address,
// balances, active write tools, contacts, goals, and advice memory.
// Appended after STATIC_SYSTEM_PROMPT in the combined system prompt.
// In RE-1.3 this becomes the second (uncached) system block.
// ---------------------------------------------------------------------------

export function buildDynamicBlock(
  walletAddress: string,
  tools: Tool[],
  opts?: {
    balances?: WalletBalanceSummary;
    contacts?: Contact[];
    swapTokenNames?: string[];
    goals?: GoalSummary[];
    adviceContext?: string;
    useSyntheticPrefetch?: boolean;
  },
): string {
  const balances = opts?.balances;
  const contacts = opts?.contacts;
  const swapTokenNames = opts?.swapTokenNames;
  const goals = opts?.goals;
  const adviceContext = opts?.adviceContext;

  const balanceSection = opts?.useSyntheticPrefetch
    ? 'Wallet balances and savings positions were prefetched as balance_check and savings_info tool results at the start of this conversation. Reference those results for current data. After ANY write action, call balance_check for fresh data.'
    : (() => {
        const balanceLines = balances?.coins.length
          ? balances.coins.map((c) => {
              const usd = c.usdValue != null ? ` ($${c.usdValue.toFixed(2)})` : '';
              return `${c.symbol}: ${c.amount}${usd}`;
            }).join(', ')
          : 'unknown';
        return `Current wallet balances (snapshot at session start): ${balanceLines}`;
      })();

  const writeTools = tools.filter((t) => !t.isReadOnly);
  const writeToolList = writeTools.map((t) => `- ${t.name}`).join('\n');

  const contactsBlock = contacts && contacts.length > 0
    ? `Saved contacts: ${contacts.map((c) => `${c.name} → ${c.address}`).join(', ')}\n- When user says "send to <name>", resolve from contacts above and use send_transfer with the address.`
    : 'No saved contacts yet.';

  const goalsBlock = goals && goals.length > 0
    ? `Active goals:\n${goals.map((g) => `- ${g.emoji} ${g.name}: $${g.targetAmount.toFixed(2)}${g.deadline ? ` by ${g.deadline}` : ''} (ID: ${g.id})`).join('\n')}\n- When mentioning progress, compare the total savings balance (from prefetched data or savings_info) against each goal's target.`
    : 'No savings goals set.';

  return `## Session Context
Wallet address: ${walletAddress}. Never ask for it.
${balanceSection}

## Your write tools (you CAN execute these — use them)
${writeToolList}

When a user asks to swap, save, send, stake, borrow, repay, or claim — call the write tool directly. NEVER say "you'll need to do this manually" or "go to a DEX" for actions listed above. You have the tools. Use them.

Supported swap tokens (swap_execute resolves these by name — NO search needed): ${swapTokenNames?.join(', ') ?? 'SUI, USDC, USDT'}

## Contacts
${contactsBlock}
- To save a new contact, use the save_contact tool. Do NOT web-search for contacts.
- If user says "save a contact" or "add a contact", ask for the name and Sui address, then call save_contact.

## Savings goals
${goalsBlock}
- Users can create, list, update, and delete goals via savings_goal_* tools.
- Goals track aspirational targets against the total savings balance — they are NOT separate allocated sub-accounts.
- When a user deposits or withdraws, mention how it affects their goal progress if relevant.

## Advice memory
${adviceContext || 'No prior advice on record.'}`;
}

// ---------------------------------------------------------------------------
// Phase 3.5 — intelligence layer context assembly
// All five intelligence features are wired:
//   F1 (profile), F2 (proactive), F3 (memory), F4 (state), F5 (self-eval)
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  memoryType: string;
  content: string;
  extractedAt: Date;
  source?: string;
}

export interface PendingProposal {
  id: string;
  patternType: string;
  actionType: string;
  amount: number;
  asset: string;
  confidence: number;
}

export interface IntelligenceContext {
  profile?: UserFinancialProfile | null;
  conversationState?: ConversationState;
  memories?: MemoryEntry[];
  pendingProposals?: PendingProposal[];
}

function formatMemoryAge(extractedAt: Date): string {
  const hoursAgo = (Date.now() - extractedAt.getTime()) / 3_600_000;
  if (hoursAgo < 24) return 'today';
  if (hoursAgo < 48) return 'yesterday';
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}

/**
 * Build system prompt context from episodic user memories.
 * Returns empty string if no memories are available.
 */
export function buildMemoryContext(memories: MemoryEntry[]): string {
  if (!memories.length) return '';

  const lines: string[] = ['What you know about this user (remembered across sessions):'];
  for (const m of memories.slice(0, 8)) {
    const age = formatMemoryAge(m.extractedAt);
    const prefix = m.source === 'chain'
      ? '[on-chain observation]'
      : `[${m.memoryType}]`;
    lines.push(`- ${prefix} ${m.content} (${age})`);
  }
  return lines.join('\n');
}

export function buildFullDynamicContext(
  walletAddress: string,
  tools: Tool[],
  opts: {
    balances?: WalletBalanceSummary;
    contacts?: Contact[];
    swapTokenNames?: string[];
    goals?: GoalSummary[];
    adviceContext?: string;
    intelligence?: IntelligenceContext;
    useSyntheticPrefetch?: boolean;
  },
): string {
  const base = buildDynamicBlock(walletAddress, tools, {
    balances: opts.balances,
    contacts: opts.contacts,
    swapTokenNames: opts.swapTokenNames,
    goals: opts.goals,
    adviceContext: opts.adviceContext,
    useSyntheticPrefetch: opts.useSyntheticPrefetch,
  });

  const sections: string[] = [base];

  // F1 — user financial profile context
  if (opts.intelligence?.profile) {
    const profileCtx = buildProfileContext(opts.intelligence.profile);
    if (profileCtx) sections.push(`## User Profile\n${profileCtx}`);
  }

  // F3 — episodic memory context
  if (opts.intelligence?.memories?.length) {
    const memoryCtx = buildMemoryContext(opts.intelligence.memories);
    if (memoryCtx) sections.push(`## Remembered Context\n${memoryCtx}`);
  }

  // F4 — conversation state context
  if (opts.intelligence?.conversationState) {
    const stateCtx = buildStateContext(opts.intelligence.conversationState);
    if (stateCtx) sections.push(`## Conversation State\n${stateCtx}`);
  }

  // Phase D — pending autonomous proposals (at most 1)
  const proposals = opts.intelligence?.pendingProposals;
  if (proposals?.length) {
    const p = proposals[0];
    const label = p.patternType.replace(/_/g, ' ');
    sections.push(`## Pending Proposal\n<pending-proposals>\nYou detected a "${label}" pattern (confidence ${Math.round(p.confidence * 100)}%). Proposed: auto-${p.actionType} $${p.amount} ${p.asset}.\nMention this naturally when contextually relevant — e.g. when the user checks balances, saves, or asks about automation. Describe the pattern and ask if they'd like to enable it. The user can accept or decline via the UI card that accompanies this proposal. Do not fabricate tool calls. Never dump a list of proposals.\nProposal ID: ${p.id}\n</pending-proposals>`);
  }

  // F2 — proactive awareness instructions
  const proactiveCtx = buildProactivenessInstructions(
    opts.intelligence?.profile ?? null,
  );
  sections.push(`## Proactive Awareness\n${proactiveCtx}`);

  // F5 — post-action self-evaluation
  sections.push(`## Self-Evaluation\n${buildSelfEvaluationInstruction()}`);

  return sections.join('\n\n---\n\n');
}
