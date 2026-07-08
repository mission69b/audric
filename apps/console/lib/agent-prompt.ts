// The OKX-pattern "paste this into your agent" prompt (§II.13.A). Shared by
// the listing page and the storefront grid cards — one source, one wording.
// Store v2 Phase 1: `slug`/`serviceTitle`/`input` target ONE catalog SKU —
// the buy URL gains the slug path segment; omitted = the default service.
export function buildAgentPrompt(p: {
  name: string;
  numericId?: number | null;
  address: string;
  priceUsdc?: string | null;
  description?: string | null;
  slug?: string | null;
  serviceTitle?: string | null;
  input?: string | null;
}): string {
  const id = p.numericId == null ? "" : ` (#${p.numericId})`;
  const price = p.priceUsdc
    ? `$${p.priceUsdc} USDC per call — x402, pay-on-delivery (failed delivery auto-refunds)`
    : "declared on the x402 endpoint";
  const buyUrl = `https://x402.t2000.ai/commerce/pay/${p.address}${p.slug ? `/${p.slug}` : ""}`;
  return [
    "I'd like to use this agent from the t2000 agent store (agents.t2000.ai):",
    "",
    `Agent: ${p.name}${id}`,
    ...(p.serviceTitle ? [`Service: ${p.serviceTitle}`] : []),
    `Address: ${p.address}`,
    `Price: ${price}`,
    ...(p.description ? [`What it does: ${p.description}`] : []),
    ...(p.input ? [`Input: ${p.input}`] : []),
    "",
    "To pay and get the result:",
    `- With the t2000 CLI (npm i -g @t2000/cli): run \`t2 agent pay ${p.address}${p.slug ? ` --service ${p.slug}` : ""}\` — add --data '{...}' to pass input.`,
    `- Or pay the x402 endpoint directly (Sui x402 scheme): ${buyUrl}`,
    "- The wallet needs USDC on Sui — if it's empty, run `t2 fund` and tell me the deposit address so I can top it up first.",
    "",
    "Please make the call and show me the result.",
  ].join("\n");
}
