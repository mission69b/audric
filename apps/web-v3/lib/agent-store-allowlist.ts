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
 * All 17 are t2000-operated seeds (S.601/S.605 + Shelf v2 S.611 + Shelf v3
 * S.621; keys at ~/.t2000/seed-*.key).
 */
export const AUDRIC_STORE_SELLERS: readonly string[] = [
  // Funding Radar — cross-venue perp funding ranking
  "0x7642b3862769d5cfd8587525350df72676ba7ab3a5b558aa8607bf990f20796a",
  // Macro Liquidity — FRED net-liquidity read (Shelf v2)
  "0x74188c6d996307d92b1791407f5a989f498e8460a5d476167a3e18278cad549c",
  // Market Regime — trend/chop/stress classification (Shelf v2)
  "0x84ed0c5512e7cd60e884c137366b46e3b5dde04ae1f866b3558cb29553b95ce8",
  // Trend Align — multi-timeframe trend alignment (Shelf v2)
  "0x8e5189d1c1a9e31192fd14d2048f9f8fbdd92713b8db17697998601963573153",
  // Sui Pulse — Sui ecosystem snapshot (Shelf v2)
  "0x1479ed9f8e0b04f2fd935a39a22a285031ea9d24f73f3631c32a68b43863d96a",
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
  // Perp Pressure — perp crowding/squeeze classification (Shelf v3)
  "0x02d11a50c3d61300cce481de0d56685f4d0c3dc24e199c878e7371528ebf98ca",
  // Stable Flows — stablecoin supply expansion/contraction (Shelf v3)
  "0xde9a239ca904f8d3a56d12847760f6c7b3b9c891242e63b4ff265768189f0537",
  // Sector Radar — sector rotation read (Shelf v3)
  "0xf6dacfdf02546db19d7b304eb5a95b4667582f7fff90b8c72884d33ecbca0eb1",
  // DEX Pulse — DEX activity pulse (Shelf v3)
  "0xd0f40349893a551f02016432a8a791fa62b71e3958d8b6b4f819093c628bbead",
  // Gas Gauge — cross-chain fee gauge (Shelf v3)
  "0x95a32163a7ae0f53f8adaf711a94eabb4961eddcc536fef1d91a0bde50ac5ae6",
  // Book Depth — orderbook pressure snapshot (Shelf v3)
  "0xce1682bda0adab069b0fe6f2d7e4f7217feb391fee8332fab6adaea2f49894af",
  // Market Mood — CMC fear/greed sentiment read (Shelf v3, S.623)
  "0x020e1c31e11417b2c26dc61c9bb0094b83250924256f1da3a349c1f42d340713",
];

const ALLOWED = new Set(AUDRIC_STORE_SELLERS.map((a) => a.toLowerCase()));

export function isAllowlistedSeller(address: string): boolean {
  return ALLOWED.has(address.trim().toLowerCase());
}
