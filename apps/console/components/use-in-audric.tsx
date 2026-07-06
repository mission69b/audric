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
  // Top Movers (Shelf v4)
  "0x6328a44e353baba891c25e3c08985331340a785082e1a8cebb537968c456f21b":
    "What actually moved today \u2014 and was it real volume? Use the Top Movers read from the agent store.",
  // New Listings Radar (Shelf v4)
  "0x6f07d7f0c195e95d95ba387142d23c02be914051bc2fa3d93f94a1da30621311":
    "What just listed \u2014 and what's showing early traction? Use the New Listings Radar read from the agent store.",
  // Trending Now (Shelf v4)
  "0xd52d12295301805d74edf2c2f6771f1d5831902a8e653fddf9299dda56d1d59d":
    "What is the market looking at right now? Use the Trending Now read from the agent store.",
  // Token Profile (Shelf v4)
  "0x39eb2d705ef9e870e03058d47dd5115becc3014ce78415bfe68fc97753d1fca0":
    "One token, the full identity card. Use the Token Profile read from the agent store.",
  // Supply Overhang (Shelf v4)
  "0xa3c7d5df535fe2ab1f4a32e28e28e2afd0f61f953b2f263d4b6d22e7fefa6a1f":
    "How much of this token is still waiting to hit the market? Use the Supply Overhang read from the agent store.",
  // Dominance Shifts (Shelf v4)
  "0xb3d6ba3b270ea5ea65484b97894e858880d13da88a570522f53ccc7c4cb0da5c":
    "Is money rotating into BTC or out into alts? Use the Dominance Shifts read from the agent store.",
  // Stable Share (Shelf v4)
  "0xcb8fab93aa60813c0dd39a9de53e72fd118c298edeb29c8e782af427618649c6":
    "How much of crypto is sitting in cash? Use the Stable Share read from the agent store.",
  // Kline Patterns (Shelf v4)
  "0xf3b61519de862d1806194082d6aa575ac1c6214f5723469629e0ff8df925713a":
    "What is the chart structure actually saying? Use the Kline Patterns read from the agent store.",
  // Momentum Screen (Shelf v4)
  "0xf9c49726213d8763b01a6184d9df4c3069dcc17420eb04de8bb3196ed92b66a7":
    "Which large caps have real momentum right now? Use the Momentum Screen read from the agent store.",
  // Drawdown Board (Shelf v4)
  "0x549e453e78476612600c7de6d8e49a8fdf3b025fbe55dd94a2b81251be24da66":
    "How far below their highs are the majors trading? Use the Drawdown Board read from the agent store.",
  // Volume Anomalies (Shelf v4)
  "0x6251a99c1cfb176f563b3005139fb26b68414210c9cf372124b522730ad11dc0":
    "Whose volume is way off its baseline today? Use the Volume Anomalies read from the agent store.",
  // Market Breadth (Shelf v4)
  "0x99949bb4c37345d5659b6af53b8da9bd11b417623711912844575721721802b0":
    "Is the move broad or carried by three names? Use the Market Breadth read from the agent store.",
  // Correlation Matrix (Shelf v4)
  "0x150349a071e20d683060a8d1a637b1b4a81652f97ab126243bb6669d296b9b50":
    "Which majors actually move together right now? Use the Correlation Matrix read from the agent store.",
  // Relative Strength (Shelf v4)
  "0xa8a1902b0540a2fe124fb3b7140ce732f7a3b576a254d52577e850637b444cff":
    "Is this token beating BTC \u2014 or just riding it? Use the Relative Strength read from the agent store.",
  // Perp Scanner (Shelf v4)
  "0x7bf9ebf8fcc822ce043589897fd823ea799cf13ef48aada2cfe081373e89fac9":
    "Which perp markets deserve a look right now? Use the Perp Scanner read from the agent store.",
  // Funding Regime (Shelf v4)
  "0x302711735ac4b3ffea50082f058553e865fc2022ac32308eaa0f89bfef0e93c5":
    "Has the funding regime flipped for this perp? Use the Funding Regime read from the agent store.",
  // Liquidation Pulse (Shelf v4)
  "0x600a39a03068cc5b55c9b8263586975738ed38df7da4783952674df4d3986b95":
    "Who just got liquidated \u2014 longs or shorts? Use the Liquidation Pulse read from the agent store.",
  // OI Divergence (Shelf v4)
  "0x93d8ebe973790a70175fb7e9ad5d654b861303f0f589da5e29117c9d340b81ce":
    "Is open interest moving faster than price? Use the OI Divergence read from the agent store.",
  // Capitulation Scan (Shelf v4)
  "0x32a241f675adadcc3bb5354716054db82ae9874fad803b35e55dc0155bdb719f":
    "Which perps are getting washed out right now? Use the Capitulation Scan read from the agent store.",
  // Basis Monitor (Shelf v4)
  "0x2f49ba439b197abfc50097503b7f1184a82e25cdf0ec82f4ebab8590167f95eb":
    "What is perp basis saying about leverage appetite? Use the Basis Monitor read from the agent store.",
  // Positioning Extremes (Shelf v4)
  "0xcf1caf022854aaead591ca44c624f8f5154a9afcea39fc22c793e251e3574103":
    "Where is the crowd most one-sided? Use the Positioning Extremes read from the agent store.",
  // Squeeze Watch (Shelf v4)
  "0x5fe42df3814ee2fb570fb470dfd74577d959771d33c94184983395224a618b44":
    "Which shorts are paying to press a rising market? Use the Squeeze Watch read from the agent store.",
  // Daily Brief (Shelf v4)
  "0x561945df8d1cc598631a0aaba9ca9ff4e48be1de294e7de31c72cf3fe4d39a6f":
    "The whole market backdrop in one call. Use the Daily Brief read from the agent store.",
  // Macro Overview (Shelf v4)
  "0xd45067da5ff3f793acc6a3ea3d283fca7555e35e5eb6cdf73ce48c51cda7d38d":
    "Is the macro backdrop with you or against you? Use the Macro Overview read from the agent store.",
  // Portfolio Read (Shelf v4)
  "0xcceeb4f7bce0b0180e617b6b537183d84248b51c9bebd1ed83be423c0296153e":
    "What is my portfolio actually exposed to? Use the Portfolio Read read from the agent store.",
  // Post Pulse (Shelf v4)
  "0x9a1375976193b442853969038f4ef2c8a579ec9fb9cd37cafb7e795f7d35254b":
    "How is this X post actually performing? Use the Post Pulse read from the agent store.",
  // Listing Copywriter (Shelf v4)
  "0x86a0c73439e02b56fcf6be107a307e43a3563be659ef35b16cc0eb4455f75417":
    "Turn what your agent does into copy that sells it. Use the Listing Copywriter read from the agent store.",
  // Thread Writer (Shelf v4)
  "0x933925baf752bda3b1729a1a8bfa14f03195d65e3a1c58bdd9eb88a6e655bb06":
    "Turn any report into a post-ready X thread. Use the Thread Writer read from the agent store.",
  // Wallet Health (Shelf v4)
  "0x214abeb9aaec6a72a20bf19d74ab477a1049b4ee8af1aaee1b65017c7e2cdcfa":
    "A quick structural read on any Sui wallet. Use the Wallet Health read from the agent store.",
  // Sui Epoch Report (Shelf v4)
  "0x09a143fddde2bc44457513917e1311ce3d4f350e9a4731242609c9f6979c0632":
    "Where is the Sui network right now? Use the Sui Epoch Report read from the agent store.",
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

  // Design §UseItInline (audric tab): a lead line + ONE primary action.
  return (
    <div>
      <p className="m-0 max-w-[620px] text-[13px] text-fg-muted leading-[1.55]">
        Just ask Audric the question this service answers — it offers the
        service with the price, and you approve the ${priceUsdc} purchase with
        one tap. Same Google sign-in, same Passport wallet.
      </p>
      <Link
        className="ag-btn ag-btn--primary mt-4"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        Ask in Audric →
      </Link>
    </div>
  );
}
