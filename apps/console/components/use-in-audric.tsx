import Link from "next/link";

// "Use in Audric" (SPEC_AGENT_COMMERCE §II.12 C2, the LAST slice — shipped
// after the founder's live agent_pay smoke passed, 2026-07-03). Need-first by
// design: the deep link prefills the QUESTION the service answers (never a
// transaction) via audric.ai/?q= (the C1 prefill, injection-only — nothing
// auto-sends). Audric's agent then routes the question, offers the service
// with its price, and the purchase happens on Audric's tap-to-confirm card.
// Pure link — server-rendered, no session read, cache-friendly.

// Curated need-questions for the t2000-operated seeds (keyed by agent
// address). Third-party listings fall back to an explicit use-this-service
// ask — still question-shaped, and it opens Audric's buy-intent gate.
const SEED_QUESTIONS: Record<string, string> = {
  // Funding Radar
  "0x7642b3862769d5cfd8587525350df72676ba7ab3a5b558aa8607bf990f20796a":
    "Where's the best funding-rate carry right now across all major perp venues?",
  // Macro Liquidity
  "0x74188c6d996307d92b1791407f5a989f498e8460a5d476167a3e18278cad549c":
    "Is dollar liquidity supportive or restrictive for crypto right now? Use the Macro Liquidity read from the agent store.",
  // Market Regime
  "0x84ed0c5512e7cd60e884c137366b46e3b5dde04ae1f866b3558cb29553b95ce8":
    "What market regime is crypto in right now — trending, chopping, or stressed? Use the Market Regime read from the agent store.",
  // Trend Align
  "0x8e5189d1c1a9e31192fd14d2048f9f8fbdd92713b8db17697998601963573153":
    "Is BTC bullish or bearish across the 1h, 4h, and daily timeframes? Use the Trend Align service from the agent store.",
  // Sui Pulse
  "0x1479ed9f8e0b04f2fd935a39a22a285031ea9d24f73f3631c32a68b43863d96a":
    "What's happening on Sui right now? Use the Sui Pulse snapshot from the agent store.",
  // Stable Yields
  "0x9af2e1821b7dad818d288f1cc2248c1ccf1e535b3a55ef7b742ea379664ca101":
    "Where are the best stablecoin yields right now? Use the Stable Yields service from the agent store.",
  // Card Forge
  "0x7ab3d60d17f0eb9084142ca9a516b6ee5483d0cda5608f85df93c3343abe23d6":
    "Use Card Forge from the agent store to make a shareable trading card for my agent.",
  // Tech Pulse
  "0x9134caa730cdf29043559461cde0c59c48e9354798c5dfb6ed969c0f81e091be":
    "What's moving in tech today? Use the Tech Pulse report from the agent store.",
  // FX Rates
  "0x875d87c0b442a4e86390c85ae0f57c770a76614bf597ef1f98eb374503c5acd0":
    "Get me today's FX rates for the major pairs using the FX Rates service from the agent store.",
  // Coin Quotes
  "0x37dd2bd8b17165185419880e3eed7a32209dbc3f7acec877bf6a44c66beab433":
    "Use the Coin Quotes service from the agent store and show me what it returns.",
  // funkii-agnt-cli
  "0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf":
    "Use the funkii-agnt-cli service from the agent store to get the live SUI spot price.",
  // Perp Pressure (Shelf v3)
  "0x02d11a50c3d61300cce481de0d56685f4d0c3dc24e199c878e7371528ebf98ca":
    "Is the BTC perp market crowded long or short right now? Use the Perp Pressure read from the agent store.",
  // Stable Flows (Shelf v3)
  "0xde9a239ca904f8d3a56d12847760f6c7b3b9c891242e63b4ff265768189f0537":
    "Is stablecoin supply expanding or contracting — is money entering crypto? Use the Stable Flows read from the agent store.",
  // Sector Radar (Shelf v3)
  "0xf6dacfdf02546db19d7b304eb5a95b4667582f7fff90b8c72884d33ecbca0eb1":
    "Which crypto sectors are leading and lagging today? Use the Sector Radar read from the agent store.",
  // DEX Pulse (Shelf v3)
  "0xd0f40349893a551f02016432a8a791fa62b71e3958d8b6b4f819093c628bbead":
    "Is on-chain DEX trading heating up or cooling off? Use the DEX Pulse read from the agent store.",
  // Gas Gauge (Shelf v3)
  "0x95a32163a7ae0f53f8adaf711a94eabb4961eddcc536fef1d91a0bde50ac5ae6":
    "What's the cheapest chain to move value on right now? Use the Gas Gauge read from the agent store.",
  // Book Depth (Shelf v3)
  "0xce1682bda0adab069b0fe6f2d7e4f7217feb391fee8332fab6adaea2f49894af":
    "Where's the resting liquidity in the BTC orderbook — bid support or ask overhang? Use the Book Depth read from the agent store.",
  // Market Mood (Shelf v3, CMC)
  "0x020e1c31e11417b2c26dc61c9bb0094b83250924256f1da3a349c1f42d340713":
    "Is the crypto crowd fearful or greedy right now? Use the Market Mood read from the agent store.",
};

export function UseInAudric({
  address,
  name,
  priceUsdc,
  qualified,
}: {
  address: string;
  name: string;
  priceUsdc: string;
  /** Receipt-bar pass (S.624): third-party sellers with proven delivered
   *  sales get the generic need-question; mirrors web-v3's executor gate so
   *  the button never points at a purchase Audric would refuse. */
  qualified?: boolean;
}) {
  const curated = SEED_QUESTIONS[address.toLowerCase()];
  const question =
    curated ??
    (qualified
      ? `Use the ${name} service from the agent store (seller ${address}) and show me what it returns.`
      : null);
  if (!question) {
    return null;
  }
  const href = `https://audric.ai/?q=${encodeURIComponent(question)}`;

  return (
    <div className="mt-5 rounded-xl bg-background/60 p-4">
      <div className="font-medium text-foreground text-sm">Use in Audric</div>
      <p className="mt-1 text-muted-foreground/70 text-xs">
        Ask the question this service answers — Audric offers it with the price
        and you approve the ${priceUsdc} purchase with one tap. Same Google
        sign-in, same Passport wallet.
      </p>
      <Link
        className="mt-3 inline-block rounded-full border border-border/60 px-4 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-secondary"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        Ask in Audric →
      </Link>
    </div>
  );
}
