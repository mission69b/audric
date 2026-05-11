/**
 * SPEC 23A-A1 — per-tool result-preview registry.
 *
 * Demos pack a one-line "result" preview into every parallel-row sub-text:
 *
 *   {glyph:'💰',label:'BALANCE',         result:'$2,000 USDC'},
 *   {glyph:'⇆',label:'CETUS · SUI ROUTE', result:'$200 → 212.77 SUI · 0.03%'},
 *   {glyph:'📈',label:'NAVI USDSUI POOL', result:'8.4% APY · TVL $48M'},
 *   {glyph:'👤',label:'CONTACT · "MOM"',  result:'0xa3f9…b27c · verified'},
 *
 * Pre-A1 audric collapsed every read into a generic `"querying…"` →
 * `"ran in 1.2s"` two-state surface. This registry returns a demo-quality
 * string per (toolName, result) pair so `ParallelToolsGroup.rowSub` can
 * surface the actual finding inline (the cards below still carry the full
 * payload — this is the at-a-glance sub-line).
 *
 * Returns `undefined` for any tool/result pair we don't have a fitter for —
 * caller falls through to `"ran in Ns"`. Defensive type-narrowing throughout
 * because `tool.result` is `unknown` at the call site (it's whatever the
 * engine tool produced, not a typed payload).
 */

// Result shapes follow the engine convention `{ data, displayText }`.
// `extractData` is the canonical unwrapper.
function extractData(result: unknown): unknown {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: unknown }).data;
  }
  return result;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

// Compact USD formatter sized for one-line row sub-text.
//   ≥1B   → "$1.2B"
//   ≥1M   → "$48M"
//   ≥10k  → "$48k" or "$2.4k" (the in-between band uses no abbreviation)
//   ≥1k   → "$2,000" (commas — under 10k stays expanded so the demo's
//                     "$2,000 USDC" headline number reads naturally)
//   ≥100  → "$800"
//   ≥1    → "$11.00"
//   ≥0.01 → "$0.21"
//   else  → "$0.0046" (dust / token prices)
function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (abs >= 10_000) return `$${Math.round(n / 1_000)}k`;
  if (abs >= 1_000) return `$${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  if (abs >= 100) return `$${n.toFixed(0)}`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs >= 0.01) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function shortAddr(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Per-tool fitters. Each returns `string | undefined`.
// Keep these small — every fitter is one type-check + one format. If a
// fitter starts to bloat past ~20 lines, consider whether a richer surface
// belongs in SPEC 23B per-tool card territory instead.
// ───────────────────────────────────────────────────────────────────────────

function previewBalanceCheck(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const total = typeof data.total === 'number' ? data.total : undefined;
  const savings = typeof data.savings === 'number' ? data.savings : 0;
  const isWatched = data.isSelfQuery === false;
  const subject = isWatched
    ? typeof data.suinsName === 'string' && data.suinsName
      ? data.suinsName
      : typeof data.address === 'string'
        ? shortAddr(data.address)
        : 'wallet'
    : null;

  if (total === undefined) return undefined;
  // Demo surfaces "$2,000 USDC" (the headline) — we mirror with total + a
  // "earning $X" annotation when there's an active savings deposit.
  const head = subject ? `${subject} · ${fmtUsd(total)}` : `${fmtUsd(total)} total`;
  if (savings > 0) return `${head} · earning ${fmtUsd(savings)}`;
  return head;
}

function previewSwapQuote(data: unknown): string | undefined {
  // Engine returns `data: { fromToken, toToken, fromAmount, toAmount,
  // priceImpact, route, ... }` (see packages/sdk/src/swap-quote.ts +
  // packages/engine/src/tools/swap-quote.ts). The recoverable-error
  // branch returns `{ error, errorCode, hint, recoverable }` instead.
  if (!isObject(data)) return undefined;
  if (typeof data.errorCode === 'string') return 'no route — refining';
  const fromSym = typeof data.fromToken === 'string' ? data.fromToken : undefined;
  const toSym = typeof data.toToken === 'string' ? data.toToken : undefined;
  const fromAmt = typeof data.fromAmount === 'number' ? data.fromAmount : undefined;
  const toAmt = typeof data.toAmount === 'number' ? data.toAmount : undefined;
  const priceImpact =
    typeof data.priceImpact === 'number' ? data.priceImpact : undefined;

  if (!fromSym || !toSym) return undefined;
  const left =
    fromAmt !== undefined ? `${fromAmt.toFixed(fromAmt < 1 ? 4 : 2)} ${fromSym}` : fromSym;
  const right =
    toAmt !== undefined ? `${toAmt.toFixed(toAmt < 1 ? 4 : 2)} ${toSym}` : toSym;
  const tail = priceImpact !== undefined ? ` · ${(priceImpact * 100).toFixed(2)}%` : '';
  return `${left} → ${right}${tail}`;
}

function previewRatesInfo(data: unknown): string | undefined {
  // NAVI rates are a flat `Record<symbol, { saveApy, borrowApy, ... }>`.
  // The engine writes the symbol verbatim from NAVI's pool list — sometimes
  // 'USDSUI' (uppercase, newer pools), sometimes 'USDsui' (mixed case,
  // engine-side aliases), see packages/engine/src/navi/transforms.ts. Match
  // case-insensitively so demo-style "USDC X% · USDsui Y%" renders for
  // either casing. Sample top 2 stables — that's what the demo cards show.
  if (!isObject(data)) return undefined;
  const lookup = new Map<string, number>();
  for (const [k, v] of Object.entries(data)) {
    if (!isObject(v)) continue;
    const apy = v.saveApy;
    if (typeof apy === 'number') lookup.set(k.toLowerCase(), apy);
  }
  const usdc = lookup.get('usdc');
  const usdsui = lookup.get('usdsui');
  if (usdc === undefined && usdsui === undefined) return undefined;
  const parts: string[] = [];
  if (usdc !== undefined) parts.push(`USDC ${(usdc * 100).toFixed(2)}%`);
  if (usdsui !== undefined) parts.push(`USDsui ${(usdsui * 100).toFixed(2)}%`);
  return parts.join(' · ');
}

function previewSavingsInfo(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const fundStatus = isObject(data.fundStatus) ? data.fundStatus : undefined;
  const supplied =
    typeof fundStatus?.supplied === 'number' ? fundStatus.supplied : undefined;
  const apy = typeof fundStatus?.apy === 'number' ? fundStatus.apy : undefined;
  if (supplied === undefined) return undefined;
  if (supplied === 0) return 'no active deposits';
  if (apy === undefined) return `${fmtUsd(supplied)} saved`;
  return `${fmtUsd(supplied)} saved · ${(apy * 100).toFixed(2)}% APY`;
}

function previewHealthCheck(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const hf = typeof data.healthFactor === 'number' ? data.healthFactor : undefined;
  const status = typeof data.status === 'string' ? data.status : undefined;
  if (hf === undefined && !status) return undefined;
  if (hf === undefined) return status!;
  if (hf >= 9999) return 'no debt · safe';
  return `HF ${hf.toFixed(2)}${status ? ` · ${status}` : ''}`;
}

function previewMppServices(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  // ACI refinement payload — show that we're narrowing.
  if ('_refine' in data) return 'refining query…';
  // Engine returns `{ services: [...], total: N, mode? }` (see
  // packages/engine/src/tools/mpp-services.ts). The demo's "40 svcs · 88
  // endpts" implies an endpoint count too — that field doesn't exist in
  // the engine response today (the catalog list itself doesn't break down
  // endpoints per service). When SPEC 23B's MPP work surfaces endpoint
  // counts upstream, extend this fitter to include them. For now: services
  // count only.
  const services = Array.isArray(data.services) ? data.services : undefined;
  if (services === undefined) return undefined;
  return services.length === 1 ? '1 svc' : `${services.length} svcs`;
}

function previewWebSearch(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const results = Array.isArray(data.results) ? data.results : undefined;
  if (results === undefined) return undefined;
  if (results.length === 0) return 'no results';
  // Engine returns `{ results: [{title, url, description}, ...] }` (see
  // packages/engine/src/tools/web-search.ts). No `domain` field — we
  // derive it from the URL's hostname so the demo's "Title · domain"
  // pattern still renders.
  const top = results[0];
  if (!isObject(top)) return `${results.length} results`;
  const title = typeof top.title === 'string' ? top.title : undefined;
  const url = typeof top.url === 'string' ? top.url : undefined;
  const domain = url ? hostnameOf(url) : undefined;
  if (!title) return `${results.length} results`;
  const truncTitle = title.length > 48 ? `${title.slice(0, 45)}…` : title;
  if (domain) return `${truncTitle} · ${domain}`;
  return truncTitle;
}

/** Cheap, defensive `URL.hostname` extractor — strips `www.` for compactness.
 *  Returns undefined on parse failure (the row falls through to title-only). */
function hostnameOf(url: string): string | undefined {
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function previewTransactionHistory(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  if ('_refine' in data) return 'refining query…';
  const txns = Array.isArray(data.transactions) ? data.transactions : undefined;
  if (txns === undefined) return undefined;
  if (txns.length === 0) return 'no transactions';
  // Try to pull the most-recent timestamp for a "last <duration>" tail.
  const first = isObject(txns[0]) ? txns[0] : undefined;
  const ts = first && typeof first.timestamp === 'number' ? first.timestamp : undefined;
  if (ts) {
    const ageMs = Date.now() - ts;
    const ageMin = Math.round(ageMs / 60_000);
    const ageStr =
      ageMin < 1 ? 'just now' : ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;
    return `${txns.length} tx · last ${ageStr}`;
  }
  return `${txns.length} tx`;
}

function previewTokenPrices(data: unknown): string | undefined {
  // Engine returns `data: PriceResult[]` — an ARRAY of `{ coinType, symbol,
  // price, change24h?, priceUnavailable? }`. See packages/engine/src/tools/
  // token-prices.ts. NOT an object — `isObject` would reject it.
  if (!Array.isArray(data)) return undefined;
  const priced = data.filter(
    (r): r is { symbol: string; price: number } =>
      isObject(r) && typeof r.symbol === 'string' && typeof r.price === 'number',
  );
  if (priced.length === 0) return undefined;
  if (priced.length === 1) {
    const { symbol, price } = priced[0];
    return `${symbol} ${fmtUsd(price)}`;
  }
  return `${priced.length} prices`;
}

function previewPortfolioAnalysis(data: unknown): string | undefined {
  // Engine returns `data: { totalValue, walletValue, savingsValue, defiValue,
  // allocations: [...], ... }` (see packages/engine/src/tools/
  // portfolio-analysis.ts). The demo's "$X · N protocols" pattern reads from
  // allocations.length when available — each allocation row is one protocol
  // exposure (NAVI / Cetus / Bluefin / etc.).
  if (!isObject(data)) return undefined;
  const total = typeof data.totalValue === 'number' ? data.totalValue : undefined;
  const allocations = Array.isArray(data.allocations) ? data.allocations.length : undefined;
  if (total === undefined) return undefined;
  if (allocations !== undefined && allocations > 0)
    return `${fmtUsd(total)} · ${allocations} positions`;
  return `${fmtUsd(total)} total`;
}

function previewYieldSummary(data: unknown): string | undefined {
  // Engine returns `data: { today, thisWeek, thisMonth, allTime, currentApy,
  // deposited, projectedYear, sparkline }` — `today` is today's earnings
  // (see packages/engine/src/tools/yield-summary.ts). Demo pattern: "+$X/day".
  if (!isObject(data)) return undefined;
  const today = typeof data.today === 'number' ? data.today : undefined;
  if (today === undefined) return undefined;
  return `+${fmtUsd(today)}/day`;
}

function previewActivitySummary(data: unknown): string | undefined {
  // Engine returns `data: { period: 'week'|'month'|'year'|'all',
  // totalTransactions, byAction, totalMovedUsd, ... }` (see
  // packages/engine/src/tools/activity-summary.ts). Period is a string
  // label — surface it directly to match the demo's "15 tx · this month"
  // shape.
  if (!isObject(data)) return undefined;
  const txCount = typeof data.totalTransactions === 'number' ? data.totalTransactions : undefined;
  const period = typeof data.period === 'string' ? data.period : undefined;
  if (txCount === undefined) return undefined;
  if (period && period !== 'all') return `${txCount} tx · this ${period}`;
  if (period === 'all') return `${txCount} tx · all time`;
  return `${txCount} tx`;
}

function previewProtocolDeepDive(data: unknown): string | undefined {
  // Engine returns `data: { name, slug, chains, tvl, tvlChange1d, ... }`
  // (see packages/engine/src/tools/protocol-deep-dive.ts) — TVL field is
  // `tvl`, not `tvlUsd`. Demo pattern: "NAVI · TVL $48M".
  if (!isObject(data)) return undefined;
  const name = typeof data.name === 'string' ? data.name.toUpperCase() : undefined;
  const tvl = typeof data.tvl === 'number' ? data.tvl : undefined;
  if (!name) return undefined;
  if (tvl === undefined) return name;
  return `${name} · TVL ${fmtUsd(tvl)}`;
}

function previewVoloStats(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const apy = typeof data.apy === 'number' ? data.apy : undefined;
  if (apy === undefined) return undefined;
  return `vSUI ${(apy * 100).toFixed(2)}% APY`;
}

function previewPendingRewards(data: unknown): string | undefined {
  // Engine returns `data: { rewards: [...], totalValueUsd, degraded }`
  // (see packages/engine/src/tools/pending-rewards.ts).
  if (!isObject(data)) return undefined;
  const total = typeof data.totalValueUsd === 'number' ? data.totalValueUsd : undefined;
  if (total === undefined) return undefined;
  if (total === 0) return 'nothing pending';
  return `${fmtUsd(total)} claimable`;
}

function previewSpendingAnalytics(data: unknown): string | undefined {
  // Engine returns `data: { period, totalSpent, requestCount, serviceCount,
  // byService }` (see packages/engine/src/tools/spending.ts).
  if (!isObject(data)) return undefined;
  const totalSpent = typeof data.totalSpent === 'number' ? data.totalSpent : undefined;
  const reqCount = typeof data.requestCount === 'number' ? data.requestCount : undefined;
  if (totalSpent === undefined) return undefined;
  if (reqCount !== undefined) return `${fmtUsd(totalSpent)} spent · ${reqCount} reqs`;
  return `${fmtUsd(totalSpent)} spent`;
}

function previewResolveSuins(data: unknown): string | undefined {
  // Engine returns one of two shapes (see packages/engine/src/tools/
  // resolve-suins.ts):
  //   forward: { direction: 'forward', query, address, registered }
  //   reverse: { direction: 'reverse', query, names, primary }
  // In forward, `query` is the .sui name; in reverse, `query` is the 0x
  // address. We surface "name → addr" in both cases, falling back to the
  // unregistered message when forward.address is null.
  if (!isObject(data)) return undefined;
  const direction = typeof data.direction === 'string' ? data.direction : undefined;
  const query = typeof data.query === 'string' ? data.query : undefined;
  if (!query) return undefined;

  if (direction === 'forward') {
    const address = typeof data.address === 'string' ? data.address : null;
    return address ? `${query} → ${shortAddr(address)}` : `${query} · unregistered`;
  }
  if (direction === 'reverse') {
    const primary = typeof data.primary === 'string' ? data.primary : null;
    return primary ? `${shortAddr(query)} → ${primary}` : `${shortAddr(query)} · no name`;
  }
  return undefined;
}

function previewExplainTx(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const summary = typeof data.summary === 'string' ? data.summary : undefined;
  if (!summary) return undefined;
  return summary.length > 56 ? `${summary.slice(0, 53)}…` : summary;
}

function previewPaymentLink(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const url = typeof data.url === 'string' ? data.url : undefined;
  if (url) return url.replace(/^https?:\/\//, '');
  const slug = typeof data.slug === 'string' ? data.slug : undefined;
  if (slug) return `audric.ai/pay/${slug}`;
  return undefined;
}

function previewListPaymentLinks(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const links = Array.isArray(data.links) ? data.links : undefined;
  if (links === undefined) return undefined;
  return links.length === 0 ? 'no active links' : `${links.length} active links`;
}

function previewInvoice(data: unknown): string | undefined {
  // Engine returns `data: { slug, url, amount, currency, label, dueDate, ... }`
  // (see packages/engine/src/tools/receive.ts createInvoiceTool). The
  // `amount` is in the invoice's own currency (USDC), label is the
  // free-form description.
  if (!isObject(data)) return undefined;
  const amount = typeof data.amount === 'number' ? data.amount : undefined;
  const label = typeof data.label === 'string' ? data.label : undefined;
  if (amount === undefined) return undefined;
  return label ? `${fmtUsd(amount)} · ${label}` : `${fmtUsd(amount)} invoice`;
}

function previewListInvoices(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  const invoices = Array.isArray(data.invoices) ? data.invoices : undefined;
  if (invoices === undefined) return undefined;
  return invoices.length === 0 ? 'no open invoices' : `${invoices.length} open`;
}

// ───────────────────────────────────────────────────────────────────────────
// Registry — one entry per supported tool. Falls through to `undefined`
// when the tool isn't covered (caller renders `"ran in Ns"`).
// ───────────────────────────────────────────────────────────────────────────

const PREVIEWERS: Record<string, (data: unknown) => string | undefined> = {
  balance_check: previewBalanceCheck,
  swap_quote: previewSwapQuote,
  rates_info: previewRatesInfo,
  savings_info: previewSavingsInfo,
  health_check: previewHealthCheck,
  mpp_services: previewMppServices,
  web_search: previewWebSearch,
  transaction_history: previewTransactionHistory,
  token_prices: previewTokenPrices,
  portfolio_analysis: previewPortfolioAnalysis,
  yield_summary: previewYieldSummary,
  activity_summary: previewActivitySummary,
  protocol_deep_dive: previewProtocolDeepDive,
  volo_stats: previewVoloStats,
  pending_rewards: previewPendingRewards,
  spending_analytics: previewSpendingAnalytics,
  resolve_suins: previewResolveSuins,
  explain_tx: previewExplainTx,
  create_payment_link: previewPaymentLink,
  list_payment_links: previewListPaymentLinks,
  cancel_payment_link: () => 'link cancelled',
  create_invoice: previewInvoice,
  list_invoices: previewListInvoices,
  cancel_invoice: () => 'invoice cancelled',
};

/**
 * Pick the demo-style result preview for a tool's payload.
 * Returns `undefined` when no fitter exists OR the payload doesn't
 * have the expected shape (caller falls through to `"ran in Ns"`).
 *
 * @param toolName  engine tool name (e.g. `"balance_check"`)
 * @param result    raw `tool.result` from the timeline block (the
 *                  `{ data, displayText }` envelope is unwrapped here)
 */
export function getResultPreview(toolName: string, result: unknown): string | undefined {
  const fitter = PREVIEWERS[toolName];
  if (!fitter) return undefined;
  try {
    return fitter(extractData(result));
  } catch {
    // Defensive: any narrowing slip-up returns `undefined` so the row
    // falls through to the generic timing text rather than crashing
    // the whole timeline render. The cards below carry the real payload.
    return undefined;
  }
}
