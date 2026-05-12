import type { Metadata } from 'next';
import s from './litepaper.module.css';

export const metadata: Metadata = {
  title: 'Audric — Litepaper',
  description: 'Agentic finance on Sui. Manage and move money globally. 1,000+ users.',
  openGraph: {
    title: 'Audric — Agentic Finance on Sui',
    description: 'Manage and move money globally. One sentence. Sub-second settlement. 35 tools. 1,000+ users.',
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
          <a href="https://x.com/audricai" className={s.navCta}>X</a>
        </div>
      </nav>

      <div className={s.page}>

        {/* Hero */}
        <div className={s.hero}>
          <div className={s.eyebrow}>Agentic Finance on Sui · May 2026</div>
          <h1>Talk to<br /><em>your money.</em></h1>
          <p className={s.heroLede}>
            Manage and move money globally. One sentence. Sub-second settlement. 35 tools run silently behind every conversation — memory, advice log, chain facts, portfolio context, all assembled before you finish typing. 1,000+ users on Sui mainnet.
          </p>
          <div className={s.heroMeta}>t2000 AFI &nbsp;·&nbsp; Delaware &nbsp;·&nbsp; audric.ai</div>
        </div>

        {/* Problem */}
        <section className={s.sec}>
          <div className={s.secLabel}>The Problem</div>
          <h2>Finance is broken<br /><em>at the interface.</em></h2>
          <p>Traditional banking: slow, expensive, stops at borders. Crypto fixed the rails but broke the experience. AI arrived and still can&apos;t manage or move your money. The gap has always been the interface.</p>
          <img src="/litepaper/slide-maze.png" alt="Finance as a maze vs a conversation" className={s.slideImg} />
          <img src="/litepaper/slide-seven-steps.png" alt="Seven steps or one sentence" className={s.slideImg} />
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
          <a href="https://audric-v2-demos.vercel.app/demos/01-save-50.html" className={s.demoLink} target="_blank" rel="noopener noreferrer">→ Demo 01 · Swap, Save &amp; Send in one sentence</a>

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

          <p>Buyers need no wallet, no SUI, no prior account. Google sign-in creates their wallet on the spot. Settles in 0.4 seconds. Multi-vendor atomic payments — one sentence, one signature, everything or nothing.</p>
          <a href="https://audric-v2-demos.vercel.app/demos/02-payment-link.html" className={s.demoLink} target="_blank" rel="noopener noreferrer">→ Demo 02 · Pay with no wallet, no SUI</a>
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

          <p>Spotify pays <strong>$0.003 per stream</strong>. Audric pays <strong>$4.60 on a $5 sale</strong>. Total cost to create a lo-fi beat + cover art on Sui: <strong>$0.09</strong>. On Ethereum, gas alone exceeds the sale price.</p>
          <a href="https://audric-v2-demos.vercel.app/demos/03-make-a-beat.html" className={s.demoLink} target="_blank" rel="noopener noreferrer">→ Demo 03 · Make a beat &amp; sell it for $5</a>
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

          <p>Memory, advice log, chain facts, portfolio context — all assembled before you finish typing. The agent only acts when you&apos;re present. Tap to confirm, every time.</p>
          <p>The agent isn&apos;t just reactive. Shopping for a house party: Audric noticed the user hadn&apos;t added beverages, found drinks within budget, and included them before asking. Reasoning from context — not hallucinating.</p>

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
          <img src="/litepaper/slide-positioning.png" alt="Audric competitive positioning — simple UX, sub-second settlement" className={s.slideImg} />
          <p className={s.pullQuote}>&ldquo;Most fintech adds features. We removed them. The product gets better every time we cut something.&rdquo;</p>
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

          <p>Fees collected inline — atomic with the transaction, no separate settlement. Revenue scales with volume. No subscription. Send, receive, and withdraw are free.</p>
          <p>Secondary: <code>mpp.t2000.ai</code> — 40+ paid APIs, 88 endpoints, pay-per-request in USDC. Open to any AI agent building on Sui.</p>
        </section>

        {/* Traction */}
        <section className={s.sec}>
          <div className={s.secLabel}>Traction</div>
          <h2>Live on Sui mainnet.<br /><em>Not a demo.</em></h2>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols4}`}>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Users</div>
                <div className={s.cellValue}>1,000+</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>zero paid acquisition</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>On-chain txs</div>
                <div className={s.cellValue}>500+</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>Sui mainnet</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Tool calls</div>
                <div className={s.cellValue}>4.6K</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>agent harness</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Tokens processed</div>
                <div className={s.cellValue}>220M+</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>across all turns</div>
              </div>
            </div>
          </div>

          <div className={s.gridBorder} style={{ marginTop: '16px' }}>
            <div className={`${s.gridRow} ${s.cols4}`}>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>MPP payments</div>
                <div className={s.cellValue}>575</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>mpp.t2000.ai</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>USDC settled</div>
                <div className={s.cellValue}>$82</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>growing</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Services</div>
                <div className={s.cellValue}>40</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>AI APIs</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Settlement</div>
                <div className={s.cellValue}>~400ms</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>per payment</div>
              </div>
            </div>
          </div>

          <a href="https://audric-v2-demos.vercel.app/demos/05-mums-birthday.html" className={s.demoLink} target="_blank" rel="noopener noreferrer">→ Demo 05 · Three services, one sentence, one payment — MPP in action</a>

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

        {/* Roadmap */}
        <section className={s.sec}>
          <div className={s.secLabel}>Roadmap</div>
          <h2>Where we&apos;re going.</h2>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols4}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Now · Live</div>
                <div className={s.cellBody}>Finance, Pay, Passport, Intelligence. 1,000+ users on Sui mainnet. Zero paid acquisition.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Q3 2026</div>
                <div className={s.cellBody}>USDC onramp in chat. Offramp to 75+ country bank accounts. Cross-chain USDC.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Q4 2026</div>
                <div className={s.cellBody}>Audric Store Phase 1. t2000 Agent Marketplace — Agentic Commerce. 10,000+ users.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>2027</div>
                <div className={s.cellBody}>T2000 TGE. Self-hosted LLM — finance models, Audric as first customer. Revenue sharing begins.</div>
              </div>
            </div>
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
          <h2>$1m pre-seed.<br />t2000 AFI Inc.</h2>
          <p>Raising into <strong>t2000 AFI Inc.</strong> — a Delaware C-Corp, majority-owned by Funkii, subsidiary of Mission69b Capital Limited (BVI). Investors get equity in t2000 AFI Inc. only, ring-fenced from Mission69b&apos;s other ventures. t2000 AFI Inc. holds the Audric and t2000 IP.</p>

          <div className={s.params}>
            <div className={s.param}><div className={s.paramLabel}>Raising entity</div><div className={s.paramValue}>t2000 AFI Inc. (Delaware)</div></div>
            <div className={s.param}><div className={s.paramLabel}>Instrument</div><div className={s.paramValue}>SAFE + Token Warrant</div></div>
            <div className={s.param}><div className={s.paramLabel}>Target</div><div className={s.paramValue}>$1,000,000</div></div>
            <div className={s.param}><div className={s.paramLabel}>Minimum cheque</div><div className={s.paramValue}>$25,000</div></div>
            <div className={s.param}><div className={s.paramLabel}>Valuation cap</div><div className={s.paramValue}>$24,000,000</div></div>
            <div className={s.param}><div className={s.paramLabel}>Runway</div><div className={s.paramValue}>18 months</div></div>
          </div>

          <div className={s.tblWrap}>
            <table>
              <thead>
                <tr><th>Allocation</th><th>%</th><th>Amount</th></tr>
              </thead>
              <tbody>
                <tr><td>Engineering + runway</td><td>50%</td><td>$500k</td></tr>
                <tr><td>Anthropic / AI API</td><td>14%</td><td>$140k</td></tr>
                <tr><td>Legal + entity setup</td><td>10%</td><td>$100k</td></tr>
                <tr><td>Infrastructure &amp; servers</td><td>13%</td><td>$130k</td></tr>
                <tr><td>Smart contract audit</td><td>4%</td><td>$40k</td></tr>
                <tr><td>Marketing + growth</td><td>9%</td><td>$90k</td></tr>
              </tbody>
            </table>
          </div>

        </section>

        {/* Team */}
        <section className={s.sec}>
          <div className={s.secLabel}>Team</div>
          <h2>Built by one person.</h2>

          <div className={s.teamCard}>
            <div className={s.teamAvatar}>F</div>
            <div>
              <div className={s.teamName}>Funkii</div>
              <div className={s.teamRole}>Founder · t2000 AFI Inc.</div>
              <div className={s.teamBio}>15+ years infrastructure at IBM, Telstra, Optus. Solo founder. CLI, SDK, engine, MCP server, MPP gateway, smart contracts, and consumer app — every line, one person. First 1,000 users without paid acquisition.<br /><br />The hardest part wasn&apos;t the AI. It was making something that felt seamless — like it should have always worked this way. Sui made that possible.</div>
            </div>
          </div>
        </section>

        {/* Links */}
        <section className={s.sec}>
          <div className={s.secLabel}>Links</div>
          <div className={s.linkRow}>
            <a className={s.linkChip} href="https://audric.ai">audric.ai</a>
            <a className={s.linkChip} href="https://audric-v2-demos.vercel.app">Demo Playbook</a>
            <a className={s.linkChip} href="https://t2000.ai">t2000.ai</a>
            <a className={s.linkChip} href="https://mpp.t2000.ai">mpp.t2000.ai</a>
            <a className={s.linkChip} href="https://x.com/audricai">X · @audricai</a>
            <a className={s.linkChip} href="https://discord.gg/qE95FPt6Z5">Discord</a>
            <a className={s.linkChip} href="https://www.npmjs.com/package/@t2000/engine">@t2000/engine</a>
          </div>
        </section>

        <div className={s.footer}>
          <p className={s.footerLegal}>
            Audric facilitates on-chain transactions the user explicitly approves. It does not provide financial advice, manage assets on behalf of users, or hold custody of funds. This document is for informational purposes only and does not constitute an offer or solicitation to invest. Participation involves smart contract risk, market risk, and potential loss of funds.
          </p>
          <div className={s.footerMeta}>t2000 AFI Inc. (Delaware) &nbsp;·&nbsp; Subsidiary of Mission69b Capital Limited (BVI) &nbsp;·&nbsp; Litepaper · May 2026</div>
        </div>

      </div>
    </>
  );
}
