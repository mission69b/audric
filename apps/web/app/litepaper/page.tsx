import type { Metadata } from 'next';
import s from './litepaper.module.css';

export const metadata: Metadata = {
  title: 'Audric — Litepaper',
  description: 'Conversational finance on Sui. Your money, handled.',
  openGraph: {
    title: 'Audric Litepaper',
    description: 'Conversational finance on Sui. Send money in 0.4 seconds. Earn 6% on idle cash.',
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
          <div className={s.eyebrow}>Litepaper · April 2026</div>
          <h1>Your money,<br /><em>handled.</em></h1>
          <p className={s.heroLede}>
            Conversational finance on Sui. Send money in 0.4 seconds. Earn 6% on idle cash. An agent that already knows your finances — before you type a word.
          </p>
          <div className={s.heroMeta}>t2000 AFI &nbsp;·&nbsp; Delaware &nbsp;·&nbsp; audric.ai</div>
        </div>

        {/* Problem */}
        <section className={s.sec}>
          <div className={s.secLabel}>The Problem</div>
          <h2>Your money apps don&apos;t<br /><em>understand money.</em></h2>
          <p>Your bank charges $25 for a wire. Your savings earns 0.1%. PayPal takes a cut. None of them know you — your history, your goals, what you asked last month.</p>
          <p>AI got good at answering questions. It doesn&apos;t move money.</p>
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
              <div className={`${s.bubble} ${s.bubbleAgent}`}>I see $284 idle. Sending $30 to alex (free, 0.4s). Saving $250 to NAVI at 6.2% APY. Payment link: <b>audric.ai/pay/mK9Xz · $65 USDC</b>. Confirm all three?</div>
              <div className={`${s.bubble} ${s.bubbleUser}`}>Yes</div>
              <div className={`${s.bubble} ${s.bubbleAgent}`}>Done. $30 sent. $249.75 saved. Payment link live.</div>
            </div>
          </div>

          <p>Non-custodial. Sponsored gas. Sub-second finality. You never see an address or a gas fee.</p>
        </section>

        {/* Products */}
        <section className={s.sec}>
          <div className={s.secLabel}>AI-native finance engine</div>
          <h2>What Audric does.</h2>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols3}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Passport</div>
                <div className={s.cellBody}>Sign in with Google. Non-custodial wallet in 3 seconds. Every action taps to confirm. Sponsored gas — you never pay network fees.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Intelligence</div>
                <div className={s.cellBody}>34 tools. 14 safety guards. Knows your risk profile, your history, and what it told you last month — silently, before you ask.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Finance</div>
                <div className={s.cellBody}>Save at 3–8% APY. Borrow against savings. Swap across 20+ DEXs. Portfolio charts from chat.</div>
              </div>
            </div>
            <div className={`${s.gridRow} ${s.cols3}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Pay</div>
                <div className={s.cellBody}>Send USDC to anyone. Payment links, invoices, QR codes. Free. Global. 0.4 seconds. No fees, no bank.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Store</div>
                <div className={s.cellBody}>Creator marketplace at <code>audric.ai/username</code>. Sell AI-generated content in USDC. 92% to the creator. Coming soon.</div>
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
                <div className={s.cellBody}>Google sign-in → non-custodial wallet in 3 seconds. No seed phrase. The onboarding moat.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Sponsored gas</div>
                <div className={s.cellBody}>Enoki pays the network fee. Users never need SUI to transact.</div>
              </div>
            </div>
            <div className={`${s.gridRow} ${s.cols2}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Sub-second finality</div>
                <div className={s.cellBody}>Payments land in ~0.4 seconds. Feels like a text message.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Native USDC + deep DeFi</div>
                <div className={s.cellBody}>Circle native USDC. NAVI lending. Cetus 20+ DEX routes. No bridges.</div>
              </div>
            </div>
          </div>
        </section>

        {/* Intelligence */}
        <section className={s.sec}>
          <div className={s.secLabel}>Audric Intelligence</div>
          <h2>The moat runs before<br /><em>you type a word.</em></h2>
          <p>Five systems assemble your financial profile, load your on-chain history, and recall past advice — silently, every turn. Users experience it as &ldquo;Audric already knew.&rdquo;</p>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols3}`}>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Agent Harness</div>
                <div className={s.cellBody}>34 tools. 23 reads in parallel. 11 writes with Passport confirmation. All in one conversation.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Reasoning Engine</div>
                <div className={s.cellBody}>14 guards, 3 tiers. 6 skill recipes for multi-step flows. Adaptive model routing per turn.</div>
              </div>
              <div className={s.gridCell}>
                <div className={s.cellTitle}>Silent Profile + Memory</div>
                <div className={s.cellBody}>Risk profile inferred silently. Chain facts from transaction history. AdviceLog never contradicts itself.</div>
              </div>
            </div>
          </div>
        </section>

        {/* Business Model */}
        <section className={s.sec}>
          <div className={s.secLabel}>Business Model</div>
          <h2>Protocol fees, on-chain.<br />No subscriptions.</h2>

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
                <div className={s.cellLabel}>Send / Withdraw</div>
                <div className={`${s.cellValue} ${s.cellValueSm}`}>Free</div>
              </div>
            </div>
          </div>

          <p>Collected via Move smart contract every transaction. Treasury grows with volume. Secondary: MPP gateway (<code>mpp.t2000.ai</code>) — 40+ services, 88 endpoints, open to any agent.</p>
        </section>

        {/* Production */}
        <section className={s.sec}>
          <div className={s.secLabel}>Production</div>
          <h2>Live on Sui mainnet.<br />Not a demo.</h2>

          <div className={s.gridBorder}>
            <div className={`${s.gridRow} ${s.cols4}`}>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Agent tools</div>
                <div className={s.cellValue}>34</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>23 read + 11 write</div>
              </div>
              <div className={`${s.gridCell} ${s.gridCellCenter}`}>
                <div className={s.cellLabel}>Safety guards</div>
                <div className={s.cellValue}>9</div>
                <div className={`${s.cellBody} ${s.cellBodyXs}`}>3 priority tiers</div>
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
                <tr><td>Consumer app</td><td>audric.ai — Next.js 15, Vercel</td></tr>
                <tr><td>AI engine</td><td><code>@t2000/engine</code> — 34 tools, reasoning, guards, streaming</td></tr>
                <tr><td>Core SDK</td><td><code>@t2000/sdk</code> — wallet, NAVI / Cetus / VOLO adapters</td></tr>
                <tr><td>CLI + MCP</td><td><code>@t2000/cli</code> 29 commands · <code>@t2000/mcp</code> 29 tools for Claude, Cursor, Copilot</td></tr>
                <tr><td>On-chain</td><td>Sui Move — atomic Payment Intents, sponsored gas, on-chain fee transfers to the treasury wallet</td></tr>
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
          <h2>$350k pre-seed.<br />t2000 AFI (Delaware).</h2>
          <p>Raising into <strong>t2000 AFI</strong> — a Delaware C-Corp, majority-owned by Funkii, subsidiary of Mission69b Capital Limited (BVI). Investors get equity in t2000 AFI only, ring-fenced from Mission69b&apos;s other ventures.</p>

          <div className={s.params}>
            <div className={s.param}><div className={s.paramLabel}>Raising entity</div><div className={s.paramValue}>t2000 AFI (Delaware)</div></div>
            <div className={s.param}><div className={s.paramLabel}>Instrument</div><div className={s.paramValue}>SAFE + Token Warrant</div></div>
            <div className={s.param}><div className={s.paramLabel}>Target</div><div className={s.paramValue}>$350,000</div></div>
            <div className={s.param}><div className={s.paramLabel}>Minimum cheque</div><div className={s.paramValue}>$25,000</div></div>
            <div className={s.param}><div className={s.paramLabel}>Runway</div><div className={s.paramValue}>18 months</div></div>
            <div className={s.param}><div className={s.paramLabel}>Valuation cap</div><div className={s.paramValue}>$5,000,000</div></div>
          </div>

          <div className={s.tblWrap}>
            <table>
              <thead>
                <tr><th>Allocation</th><th>%</th><th>Amount</th></tr>
              </thead>
              <tbody>
                <tr><td>Engineering + runway</td><td>52%</td><td>$182k</td></tr>
                <tr><td>Anthropic / AI API</td><td>15%</td><td>$52k</td></tr>
                <tr><td>Legal + entity setup</td><td>12%</td><td>$42k</td></tr>
                <tr><td>Smart contract audit</td><td>8%</td><td>$28k</td></tr>
                <tr><td>Marketing + growth</td><td>13%</td><td>$46k</td></tr>
              </tbody>
            </table>
          </div>

          <p className={s.secNote}>18-month milestones: USDC onramp in chat &nbsp;·&nbsp; cross-chain USDC &nbsp;·&nbsp; Audric Store &nbsp;·&nbsp; T2000 TGE-ready &nbsp;·&nbsp; 1,000+ active users</p>
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
              <div className={s.teamBio}>15+ years infrastructure at IBM, Telstra, Optus. Solo founder. CLI, SDK, engine, MCP server, MPP gateway, smart contracts, and consumer app — one person, shipped in sequence.</div>
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
          <div className={s.footerMeta}>t2000 AFI (Delaware) &nbsp;·&nbsp; Subsidiary of Mission69b Capital Limited (BVI) &nbsp;·&nbsp; Litepaper · April 2026</div>
        </div>

      </div>
    </>
  );
}
