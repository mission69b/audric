import type { Metadata } from 'next';
import s from './litepaper.module.css';

export const metadata: Metadata = {
  title: 'Audric — Litepaper',
  description: 'Conversational finance on Sui. Your money, handled.',
  openGraph: {
    title: 'Audric Litepaper',
    description: 'Conversational finance on Sui. 1,000+ users. Send money in 0.4 seconds. Earn yield on idle cash.',
    type: 'article',
  },
};

export default function LitepaperPage() {
  return (
    <>
      <nav className={s.nav}>
        <a href="https://audric.ai" className={s.navBrand}>Audric</a>
        <div className={s.navLinks}>
          <a href="https://audric.ai" className={s.hideMob}>Product</a>
          <a href="https://t2000.ai" className={s.hideMob}>Infrastructure</a>
          <a href="https://discord.gg/qE95FPt6Z5" className={`${s.navCta} ${s.hideMob}`}>Discord</a>
          <a href="https://t.me/funkiirabu" className={s.navCta}>Telegram</a>
        </div>
      </nav>

      <div className={s.page}>

        {/* Hero */}
        <div className={s.hero}>
          <div className={s.eyebrow}>The interface is changing · May 2026</div>
          <h1>Talk to<br /><em>your money.</em></h1>
          <p className={s.heroLede}>
            Claude is good at tasks. It can&apos;t manage your money or move it. Audric fills that gap — conversational finance on Sui. 35 tools run silently behind every conversation. 1,000+ users. Sub-second finality.
          </p>
          <div className={s.heroMeta}>t2000 AFI &nbsp;·&nbsp; Delaware &nbsp;·&nbsp; audric.ai</div>
        </div>

        {/* Problem */}
        <section className={s.sec}>
          <div className={s.secLabel}>The Problem</div>
          <h2>Seven steps. Four apps.<br /><em>One wrong move.</em></h2>
          <p>Before you can send $1 in crypto today:</p>

          <ul className={s.frictionList}>
            <li className={s.frictionItem}>
              <span className={s.frictionNum}>01</span>
              <span className={s.frictionText}>Find a wallet app. Search the store. Hope it&apos;s not a clone.</span>
              <span className={`${s.frictionTag} ${s.frictionTagRed}`}>3,000+ fake apps removed in 2023</span>
            </li>
            <li className={s.frictionItem}>
              <span className={s.frictionNum}>02</span>
              <span className={s.frictionText}>Verify the download. Check the developer, the reviews, the URL. Manually.</span>
              <span className={s.frictionTag}>&nbsp;</span>
            </li>
            <li className={s.frictionItem}>
              <span className={s.frictionNum}>03</span>
              <span className={s.frictionText}>Write down your seed phrase. 24 words. On paper. Don&apos;t lose it.</span>
              <span className={`${s.frictionTag} ${s.frictionTagRed}`}>lose this = lose everything</span>
            </li>
            <li className={s.frictionItem}>
              <span className={s.frictionNum}>04</span>
              <span className={s.frictionText}>Buy a gas token separately. You need ETH to send USDC. Different app.</span>
              <span className={s.frictionTag}>another exchange, another KYC</span>
            </li>
            <li className={s.frictionItem}>
              <span className={s.frictionNum}>05</span>
              <span className={s.frictionText}>Find a bridge or DEX. Wrong chain? Bridge it. Hope the liquidity is there.</span>
              <span className={`${s.frictionTag} ${s.frictionTagRed}`}>bridge hacks: $2.5B lost in 2022</span>
            </li>
            <li className={s.frictionItem}>
              <span className={s.frictionNum}>06</span>
              <span className={s.frictionText}>Approve the contract, set slippage, confirm. Three transactions. Three fees.</span>
              <span className={s.frictionTag}>pray the price didn&apos;t move</span>
            </li>
            <li className={s.frictionItem}>
              <span className={s.frictionNum}>07</span>
              <span className={s.frictionText}>Copy-paste a 42-character address. One wrong character and it&apos;s gone. Forever.</span>
              <span className={`${s.frictionTag} ${s.frictionTagRed}`}>irreversible</span>
            </li>
          </ul>
          <div className={s.frictionTotal}>
            <span>Total friction</span><span>3 min + 3 days settlement</span>
          </div>
        </section>

        {/* Solution */}
        <section className={s.sec}>
          <div className={s.secLabel}>The Solution</div>
          <h2>One sentence.<br /><em>Three actions. Done.</em></h2>

          <div className={s.chat}>
            <div className={s.chatHead}>
              <div className={s.chatHeadLeft}><div className={s.dot} />Audric</div>
              <div className={s.chatHeadRight}>Online</div>
            </div>
            <div className={s.chatBody}>
              <div className={`${s.bubble} ${s.bubbleUser}`}>Send $30 to alex, save the rest of my idle cash, and make a payment link for dinner tonight</div>
              <div className={`${s.bubble} ${s.bubbleAgent}`}>Sending $30 to Alex (free, 0.4s). Saving $250 at 6.2% APY. Payment link ready: <b>audric.ai/pay/mK9Xz</b>. Confirm all three?</div>
              <div className={`${s.bubble} ${s.bubbleUser}`}>Yes</div>
              <div className={`${s.bubble} ${s.bubbleAgent}`}>Done. ✓</div>
            </div>
          </div>

          <p>Three actions. Three different apps normally. One sentence. One tap. Done.</p>

          <div className={s.statRow}>
            <div className={s.statCell}>
              <div className={s.statVal}>1</div>
              <div className={s.statLabel}>sentence with Audric</div>
            </div>
            <div className={s.statCell}>
              <div className={`${s.statVal} ${s.statValGreen}`}>$0</div>
              <div className={s.statLabel}>in fees</div>
            </div>
            <div className={s.statCell}>
              <div className={`${s.statVal} ${s.statValGreen}`}>~0.4s</div>
              <div className={s.statLabel}>to land</div>
            </div>
            <div className={s.statCell}>
              <div className={`${s.statVal} ${s.statValGreen}`}>100%</div>
              <div className={s.statLabel}>focus on what matters</div>
            </div>
          </div>
        </section>

        {/* Products */}
        <section className={s.sec}>
          <div className={s.secLabel}>AI-native finance engine</div>
          <h2>What Audric does.</h2>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols3}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Passport</div>
                <div className={s.cellBody}>Google sign-in → non-custodial wallet in 3s. No seed phrase. No gas fees.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Intelligence</div>
                <div className={s.cellBody}>35 tools, 14 guards. Knows your finances before you ask.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Finance</div>
                <div className={s.cellBody}>Save 3–8% APY. Borrow. Swap. Compound. All from chat.</div>
              </div>
            </div>
            <div className={`${s.gridRow} ${s.cols3}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Pay</div>
                <div className={s.cellBody}>Send USDC free in 0.4s. Payment links, QR, invoices.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Store</div>
                <div className={s.cellBody}>AI creates, Walrus stores, Seal gates. 92% to creator. Phase 5.</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellFaded}`} />
            </div>
          </div>
        </section>

        {/* Audric Pay */}
        <section className={s.sec}>
          <div className={s.secLabel}>Audric Pay</div>
          <h2>Send money<br /><em>like a text.</em></h2>
          <p>No bank. No SWIFT. No IBAN. No fees. Type a name or address — money lands in under half a second.</p>

          <div className={s.chat}>
            <div className={s.chatHead}>
              <div className={s.chatHeadLeft}><div className={s.dot} />Audric</div>
              <div className={s.chatHeadRight}>Online</div>
            </div>
            <div className={s.chatBody}>
              <div className={`${s.bubble} ${s.bubbleUser}`}>Create a payment link for my web design invoice — $500</div>
              <div className={`${s.bubble} ${s.bubbleAgent}`}>Payment link ready: <b>audric.ai/pay/mK9Xz</b> · $500 USDC · no expiry. Share it anywhere.</div>
            </div>
          </div>

          <p>The buyer needs no prior wallet, no SUI, no Audric account. A Google sign-in creates their wallet on the spot. They pay. It settles in 0.4 seconds. Audric is the distribution layer on both ends.</p>
          <p>The same agent handles multi-vendor payments atomically — &ldquo;buy everything for my party&rdquo; queries 4 vendors in parallel, compiles a cart, and pays all of them in one Programmable Transaction Block. One signature. One USDC payment. Everything or nothing.</p>
        </section>

        {/* Audric Store */}
        <section className={s.sec}>
          <div className={s.secLabel}>Audric Store — Phase 5</div>
          <h2>AI creates.<br /><em>Sui distributes.</em></h2>

          <div className={s.chat}>
            <div className={s.chatHead}>
              <div className={s.chatHeadLeft}><div className={s.dot} />Audric</div>
              <div className={s.chatHeadRight}>Online</div>
            </div>
            <div className={s.chatBody}>
              <div className={`${s.bubble} ${s.bubbleUser}`}>Make me a lo-fi beat called Midnight Rain and sell it for $5</div>
              <div className={`${s.bubble} ${s.bubbleAgent}`}>Generating... Stored on Walrus — permanent. Gated by Seal — pay-to-unlock. Listed at <b>audric.ai/maya/midnight-rain</b> · $5 · You earn <b>$4.60 (92%)</b> per sale.</div>
            </div>
          </div>

          <p>Spotify pays <strong>$0.003 per stream</strong>. Audric pays <strong>$4.60 on a $5 sale</strong>.</p>
          <p>One sentence creates, permanently stores, gates access, and publishes. Walrus stores content on Sui forever — no IPFS, no CDN, no link rot. Seal enforces pay-to-unlock on-chain, trustlessly. Supply caps (&ldquo;100 copies max&rdquo;) are enforced on-chain forever, not by a database anyone can edit.</p>
          <p>Total cost to create a lo-fi beat + cover art: <strong>$0.09</strong>. On Ethereum, gas alone exceeds the sale price.</p>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols3}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>AI creation</div>
                <div className={s.cellBody}>Music, art, ebooks, coloring books. One sentence to publish.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Permanent storage</div>
                <div className={s.cellBody}>Walrus — decentralised, forever on Sui. No link rot.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Pay-to-unlock</div>
                <div className={s.cellBody}>Seal — on-chain access control. Trustless. Supply caps enforced forever.</div>
              </div>
            </div>
            <div className={`${s.gridRow} ${s.cols3}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>92% to creator</div>
                <div className={s.cellBody}>Instant USDC settlement. No payout delays, no payment processor.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Buyer UX</div>
                <div className={s.cellBody}>Pay with Google account. No wallet setup. No SUI needed.</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellFaded}`} />
            </div>
          </div>
        </section>

        {/* Why Sui */}
        <section className={s.sec}>
          <div className={s.secLabel}>Why Sui</div>
          <h2>Only possible on Sui.</h2>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols2}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>zkLogin</div>
                <div className={s.cellBody}>Google sign-in → non-custodial wallet in 3 seconds. No seed phrase. Works for senders <em>and</em> buyers. The onboarding moat.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Programmable Transaction Blocks</div>
                <div className={s.cellBody}>Swap + save + send compile into one atomic operation. 4 vendors at Christmas — one signature, one USDC payment, everything or nothing.</div>
              </div>
            </div>
            <div className={`${s.gridRow} ${s.cols2}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Sponsored gas</div>
                <div className={s.cellBody}>Enoki pays the gas. Users never need SUI. Cost to create a beat: $0.09. On Ethereum, gas exceeds the sale price.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Native USDC + deep DeFi</div>
                <div className={s.cellBody}>Circle native USDC. NAVI lending. Cetus 20+ DEX routes. Walrus. Seal. No bridges, no wrapped tokens.</div>
              </div>
            </div>
          </div>
        </section>

        {/* Intelligence */}
        <section className={s.sec}>
          <div className={s.secLabel}>Audric Intelligence</div>
          <h2>The moat runs before<br /><em>you type a word.</em></h2>

          <p className={s.pullQuote}>&ldquo;Agentic doesn&apos;t mean autonomous. It means intelligent.&rdquo;</p>

          <p>Memory, advice log, chain facts, portfolio context — all assembled before you finish typing. The agent harness compiles it into a single intent. That&apos;s what agentic finance actually is.</p>
          <p>Five systems assemble your financial profile, load your on-chain history, and recall past advice — silently, every turn. Users experience it as &ldquo;Audric already knew.&rdquo; The agent only acts when you&apos;re present. Tap to confirm, every time.</p>
          <p>The agent isn&apos;t just reactive. Shopping for a house party: Audric noticed the user hadn&apos;t added beverages to the list, found drinks within the remaining budget, and included them before asking. That&apos;s the Reasoning Engine going beyond the literal request — reasoning from context, not hallucinating.</p>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols3}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Agent Harness</div>
                <div className={s.cellBody}>35 tools. Reads fan out in parallel. Writes wait for Passport confirmation and execute atomically under a transaction mutex.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Reasoning Engine</div>
                <div className={s.cellBody}>14 guards across 3 priority tiers. 6 skill recipes for multi-step flows. Adaptive model routing — fast for simple, extended thinking for complex.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Silent Profile + Memory</div>
                <div className={s.cellBody}>Risk profile inferred silently. Chain facts from transaction history. AdviceLog never contradicts itself across sessions.</div>
              </div>
            </div>
          </div>

          <p className={s.secNote}>The moat compounds. Every turn sharpens the profile. Every logged recommendation makes the next answer more consistent. Every on-chain fact is context no cold-start chatbot will ever have.</p>
        </section>

        {/* Positioning */}
        <section className={s.sec}>
          <div className={s.secLabel}>Positioning</div>
          <h2>No other product<br /><em>is near it.</em></h2>
          <p>Every competitor sits in one of two failure modes: complex UX (MetaMask, Uniswap, Kraken) or slow settlement (PayPal, traditional bank, Revolut). No other product sits at the intersection of simple and fast — Audric occupies that space alone.</p>
          <p className={s.pullQuote}>&ldquo;Most fintech adds features. We removed them. The product gets better every time we cut something.&rdquo;</p>
          <p>Seven steps to send money. Or one sentence. The interface is the product. Sui is the infrastructure. The agent is the moat.</p>
        </section>

        {/* Business Model */}
        <section className={s.sec}>
          <div className={s.secLabel}>Business Model</div>
          <h2>Protocol fees, inline.<br />No subscriptions.</h2>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols4}`}>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Save</div>
                <div className={s.cellValue}>0.1%</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Swap</div>
                <div className={s.cellValue}>0.1%</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Borrow</div>
                <div className={s.cellValue}>0.05%</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Store sale</div>
                <div className={`${s.cellValue} ${s.cellValueSm}`}>8%</div>
              </div>
            </div>
          </div>

          <p>Fees are collected inline within the same transaction — atomic with the user&apos;s action, no separate settlement step. Revenue scales with volume. No subscription, no data product, no token required to transact.</p>
          <p>Send, withdraw, and receive are free. Harvest (compound yield) carries a composite ~0.2% across its swap and save legs.</p>
          <p>Secondary: the MPP gateway (<code>mpp.t2000.ai</code>) — 40+ paid APIs, 88 endpoints, open to any AI agent building on Sui.</p>
        </section>

        {/* Traction */}
        <section className={s.sec}>
          <div className={s.secLabel}>Traction</div>
          <h2>Live on Sui mainnet.<br /><em>Not a demo.</em></h2>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols4}`}>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Users</div>
                <div className={s.cellValue}>1k+</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>zero paid acquisition</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Agent tools</div>
                <div className={s.cellValue}>35</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>24 read + 11 write</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>MPP endpoints</div>
                <div className={s.cellValue}>88</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>40+ services</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>npm packages</div>
                <div className={s.cellValue}>4</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>engine, sdk, cli, mcp</div>
              </div>
            </div>
          </div>

          <div className={s.tblWrap}>
            <table>
              <thead>
                <tr><th>Layer</th><th>Details</th></tr>
              </thead>
              <tbody>
                <tr><td>Consumer app</td><td>audric.ai — Next.js 15, Vercel, 1,000+ users</td></tr>
                <tr><td>AI engine</td><td><code>@t2000/engine</code> — 35 tools, reasoning, guards, canvas</td></tr>
                <tr><td>Core SDK</td><td><code>@t2000/sdk</code> — wallet, NAVI / Cetus / VOLO adapters</td></tr>
                <tr><td>CLI + MCP</td><td><code>@t2000/cli</code> 29 commands · <code>@t2000/mcp</code> 29 tools for Claude, Cursor, Windsurf</td></tr>
                <tr><td>On-chain</td><td>Sui mainnet — atomic PTBs, inline fee collection, USDC treasury</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Token */}
        <section className={s.sec}>
          <div className={s.secLabel}>T2000 Token</div>
          <h2>Stake. Govern. Earn fees.</h2>
          <p>Not part of this raise. Investors receive a token warrant alongside the SAFE — a contractual right to T2000 tokens at TGE, after consistent fee revenue and legal review (~3–6 months post-raise).</p>

          <div className={s.tblWrap}>
            <table>
              <thead>
                <tr><th>Parameter</th><th>Design</th></tr>
              </thead>
              <tbody>
                <tr><td>Chain</td><td>Sui (Move)</td></tr>
                <tr><td>Supply</td><td>Fixed cap — no inflation</td></tr>
                <tr><td>Revenue sharing</td><td>Stake T2000 → earn pro-rata USDC treasury fees weekly</td></tr>
                <tr><td>Governance</td><td>Vote on fee parameters, protocol upgrades</td></tr>
                <tr><td>Utility</td><td>Pay protocol fees in T2000 at a discount (portion burned)</td></tr>
                <tr><td>Vesting</td><td>4-year vest, 1-year cliff</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Raise */}
        <section className={s.sec}>
          <div className={s.secLabel}>The Raise</div>
          <h2>$500k pre-seed.<br />t2000 AFI (Delaware).</h2>
          <p>Raising into <strong>t2000 AFI</strong> — a Delaware C-Corp, majority-owned by Funkii, subsidiary of Mission69b Capital Limited (BVI). Investors get equity in t2000 AFI only, ring-fenced from Mission69b&apos;s other ventures. t2000 AFI holds the Audric and t2000 IP.</p>

          <div className={s.params}>
            <div className={s.param}><div className={s.paramLabel}>Raising entity</div><div className={s.paramValue}>t2000 AFI (Delaware)</div></div>
            <div className={s.param}><div className={s.paramLabel}>Instrument</div><div className={s.paramValue}>SAFE + Token Warrant</div></div>
            <div className={s.param}><div className={s.paramLabel}>Target</div><div className={s.paramValue}>$500,000</div></div>
            <div className={s.param}><div className={s.paramLabel}>Minimum cheque</div><div className={s.paramValue}>$25,000</div></div>
            <div className={s.param}><div className={s.paramLabel}>Valuation cap</div><div className={s.paramValue}>$12,000,000</div></div>
            <div className={s.param}><div className={s.paramLabel}>Runway</div><div className={s.paramValue}>18 months</div></div>
          </div>

          <div className={s.tblWrap}>
            <table>
              <thead>
                <tr><th>Allocation</th><th>%</th><th>Amount</th></tr>
              </thead>
              <tbody>
                <tr><td>Engineering + runway</td><td>50%</td><td>$250k</td></tr>
                <tr><td>Anthropic / AI API</td><td>14%</td><td>$70k</td></tr>
                <tr><td>Legal + entity setup</td><td>10%</td><td>$50k</td></tr>
                <tr><td>Smart contract audit</td><td>8%</td><td>$40k</td></tr>
                <tr><td>Marketing + growth</td><td>18%</td><td>$90k</td></tr>
              </tbody>
            </table>
          </div>

          <p className={s.secNote}>18-month milestones: USDC onramp in chat &nbsp;·&nbsp; cross-chain USDC &nbsp;·&nbsp; Audric Store Phase 1 &nbsp;·&nbsp; T2000 TGE-ready &nbsp;·&nbsp; 10,000+ active users</p>
        </section>

        {/* Team */}
        <section className={s.sec}>
          <div className={s.secLabel}>Team</div>
          <h2>Built by one person.</h2>

          <div className={s.teamCard}>
            <div className={s.teamAvatar}>F</div>
            <div>
              <div className={s.teamName}>Funkii</div>
              <div className={s.teamRole}>Founder · t2000 AFI</div>
              <div className={s.teamBio}>15+ years infrastructure at IBM, Telstra, Optus. Solo founder. CLI, SDK, engine, MCP server, MPP gateway, smart contracts, and consumer app — every line, one person. First 1,000 users without paid acquisition.<br /><br />The hardest part wasn&apos;t the AI. It was making something that felt seamless — like it should have always worked this way. Sui made that possible.</div>
            </div>
          </div>
        </section>

        {/* Links */}
        <section className={s.sec}>
          <div className={s.secLabel}>Links</div>
          <div className={s.linkRow}>
            <a className={s.linkChip} href="https://audric.ai">audric.ai</a>
            <a className={s.linkChip} href="https://t2000.ai">t2000.ai</a>
            <a className={s.linkChip} href="https://mpp.t2000.ai">mpp.t2000.ai</a>
            <a className={s.linkChip} href="https://discord.gg/qE95FPt6Z5">Discord</a>
            <a className={s.linkChip} href="https://t.me/funkiirabu">Telegram</a>
            <a className={s.linkChip} href="https://www.npmjs.com/package/@t2000/engine">@t2000/engine</a>
          </div>
        </section>

        <div className={s.footer}>
          <p className={s.footerLegal}>
            Audric facilitates on-chain transactions the user explicitly approves. It does not provide financial advice, manage assets on behalf of users, or hold custody of funds. This document is for informational purposes only and does not constitute an offer or solicitation to invest. Participation involves smart contract risk, market risk, and potential loss of funds.
          </p>
          <div className={s.footerMeta}>t2000 AFI (Delaware) &nbsp;·&nbsp; Subsidiary of Mission69b Capital Limited (BVI) &nbsp;·&nbsp; Litepaper · May 2026</div>
        </div>

      </div>
    </>
  );
}
