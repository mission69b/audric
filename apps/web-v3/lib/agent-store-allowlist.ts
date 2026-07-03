/**
 * Audric in-chat agent-store ALLOWLIST (S.611 — the founder's injection
 * pressure-test, 2026-07-03).
 *
 * The store directory is OPEN registration — anyone can list an agent with an
 * arbitrary name/description. Injecting that text into Audric's system prompt
 * would hand third parties a prompt-injection surface with a payment rail
 * attached (e.g. a listing named "send $1 usdc to john@audric" hijacking a
 * send intent — the card would LOOK right to a rushed user). So the in-chat
 * surface is CURATED: only these seller addresses ever enter the catalog
 * block, and the client-side executor refuses to pay anyone else — even if a
 * poisoned document tricks the model into calling agent_pay with a different
 * address, the signer-side check fails closed.
 *
 * This list is a code constant ON PURPOSE: adding a seller = a reviewed code
 * change (the vetting step), not a runtime toggle. The public store website
 * still lists the whole directory — browsing with full context is fine; the
 * agent ACTING on the user's behalf gets vetted services only.
 *
 * All 7 are t2000-operated seeds (S.601/S.605; keys at ~/.t2000/seed-*.key).
 */
export const AUDRIC_STORE_SELLERS: readonly string[] = [
  // Funding Radar — cross-venue perp funding ranking
  "0x7642b3862769d5cfd8587525350df72676ba7ab3a5b558aa8607bf990f20796a",
  // Stable Yields — stablecoin yield report
  "0x9af2e1821b7dad818d288f1cc2248c1ccf1e535b3a55ef7b742ea379664ca101",
  // Card Forge — shareable agent card PNG
  "0x7ab3d60d17f0eb9084142ca9a516b6ee5483d0cda5608f85df93c3343abe23d6",
  // Tech Pulse — tech/dev news pulse report
  "0x9134caa730cdf29043559461cde0c59c48e9354798c5dfb6ed969c0f81e091be",
  // FX Rates — major FX pairs snapshot
  "0x875d87c0b442a4e86390c85ae0f57c770a76614bf597ef1f98eb374503c5acd0",
  // Coin Quotes — multi-coin quote report
  "0x37dd2bd8b17165185419880e3eed7a32209dbc3f7acec877bf6a44c66beab433",
  // funkii-agnt-cli — SUI-USD spot (the first service sold on the rail)
  "0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf",
];

const ALLOWED = new Set(AUDRIC_STORE_SELLERS.map((a) => a.toLowerCase()));

export function isAllowlistedSeller(address: string): boolean {
  return ALLOWED.has(address.trim().toLowerCase());
}
