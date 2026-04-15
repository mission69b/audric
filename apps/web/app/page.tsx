'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/LandingNav';
import { MockChatDemo } from '@/components/landing/MockChatDemo';
import { useZkLogin } from '@/components/auth/useZkLogin';

const PRODUCTS = [
  { icon: '◎', name: 'Save', desc: 'Earn 3–8% APY on USDC. Auto-compound rewards.' },
  { icon: '→', name: 'Send', desc: 'Instant transfers. Free. Sub-second. Globally.' },
  { icon: '⊞', name: 'Credit', desc: 'Borrow against savings. Health factor alerts protect you.' },
  { icon: '⇌', name: 'Swap', desc: 'Convert tokens. Best-route via 20+ DEXs. 0.1% fee.' },
  { icon: '↙', name: 'Receive', desc: 'Payment links, QR codes, invoices. Accept USDC from anyone.' },
  { icon: '📊', name: 'Charts', desc: 'Interactive visualizations from conversation. Yield, health, portfolio.' },
];

const PASSPORT_PILLARS = [
  { icon: '🪪', title: 'Identity', desc: 'Sign in with Google. Your Passport is a cryptographic wallet, created in 3 seconds. No seed phrase. Yours forever.' },
  { icon: '💰', title: 'Budget', desc: 'You set the cap. Audric spends only what you approve, only for features you\'ve enabled. Withdraw the rest anytime.' },
  { icon: '🔐', title: 'Security', desc: 'Every autonomous action uses a short-lived signed intent. Cryptographic guardrails on-chain — not app-layer promises.' },
  { icon: '⛓️', title: 'Yours', desc: 'Non-custodial. We cannot move your money. Every transaction is on Sui mainnet, verifiable by anyone, forever.' },
];

const INTELLIGENCE_PILLARS = [
  { icon: '🎛️', title: 'Agent Harness', sub: '50 tools. One agent.', desc: 'The runtime that manages your money: balances, DeFi, analytics, payments, scheduling — all orchestrated by a single conversation.' },
  { icon: '⚡', title: 'Reasoning Engine', sub: 'Thinks before it acts.', desc: 'Classifies complexity, matches skill recipes, runs 9 safety guards before every transaction. You see its reasoning.' },
  { icon: '🧠', title: 'Intelligence Layer', sub: 'Knows your finances.', desc: 'Builds a financial profile, detects anomalies (idle USDC, health drops), adapts to your risk tolerance and goals.' },
  { icon: '🔄', title: 'Autonomous Actions', sub: 'Works while you sleep.', desc: 'Morning briefings, scheduled saves, DCA, auto-compound. 5 confirmations then fully autonomous. Trust ladder.' },
  { icon: '🔗', title: 'Chain Memory', sub: 'Remembers everything.', desc: 'Preferences, patterns, past decisions. Every conversation makes Audric smarter. No two nudges alike.' },
];

const STORE_STEPS = [
  { num: '01', label: 'Create', title: '"Make me a lo-fi track called Midnight Rain."', desc: 'AI generates the song + cover art.' },
  { num: '02', label: 'List', title: '"Sell this for $3."', desc: 'Payment link created. Free preview — full track unlocks when they pay.' },
  { num: '03', label: 'Earn', title: '"You just earned $2.76."', desc: '92% to you, instant. audric.ai/you — no app needed to buy.' },
];



interface Stats {
  totalUsers: number;
  totalSessions: number;
  totalTransactions: number;
  totalToolExecutions: number;
  totalTokens: number;
}

function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }, []);

  return stats;
}

function fmtStat(n: number | undefined): string {
  if (n === undefined || n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function LandingPage() {
  const router = useRouter();
  const { status, login } = useZkLogin();
  const stats = useStats();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/new');
  }, [status, router]);

  return (
    <div className="light-theme min-h-dvh bg-background font-heading">
      <LandingNav />

      {/* ── S1: Hero ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-12 sm:py-16 lg:py-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-5">
              Conversational finance
            </p>
            <h1 className="text-[40px] sm:text-[52px] font-normal leading-[1.05] tracking-[-2px] text-foreground mb-5">
              Your money,<br />
              <em className="italic font-light tracking-[-1.5px]">handled.</em>
            </h1>
            <p className="text-[13px] text-muted leading-[1.7] max-w-[400px] mb-6">
              Sign in with Google. Chat with your money. Earn yield, send USDC, borrow — all by conversation. No seed phrase.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={login}
                className="bg-foreground text-background px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
              >
                Sign in with Google →
              </button>
              <a
                href="#how"
                className="px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase text-muted border border-border-bright transition hover:text-foreground hover:border-foreground"
              >
                How it works ↓
              </a>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <MockChatDemo />
          </div>
        </div>
      </section>

      {/* ── S2: Dashboard Preview (dark — matches actual product) ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#00D68F] mb-3">
              The Audric Dashboard
            </p>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              This is what you get.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7] max-w-[500px] mx-auto">
              Proactive feed, handled-for-you actions, income nudges, contextual chips — all in one conversation.
            </p>
          </div>

          {/* Dashboard mockup — dark (actual product) */}
          <div className="max-w-[960px] mx-auto border border-[#363636] rounded-xl overflow-hidden bg-[#000]">
            <div className="flex min-h-[480px]">
              {/* Sidebar */}
              <div className="w-[190px] shrink-0 bg-[#000] border-r border-[#363636] p-4 hidden sm:flex flex-col gap-0.5">
                <div className="text-[13px] font-semibold text-white mb-3">
                  AUDRIC <span className="text-[8px] bg-[#363636] px-1.5 py-0.5 rounded text-[#8F8F8F] ml-1">BETA</span>
                </div>
                <div className="bg-[#191919] rounded px-2.5 py-1.5 text-[11px] text-white mb-0.5 cursor-pointer">+ New conversation</div>
                <div className="bg-[#191919] rounded px-2.5 py-1.5 text-[11px] text-[#8F8F8F] mb-2 cursor-pointer flex items-center gap-1.5">
                  <span className="text-[9px]">⌕</span> Search
                </div>
                <p className="font-mono text-[8px] tracking-[0.1em] uppercase text-[#707070] px-2.5 mb-1.5">Navigate</p>
                {[
                  { label: 'Dashboard', active: true, icon: '▫' },
                  { label: 'Portfolio', icon: '▫' },
                  { label: 'Activity', icon: '▫', dot: true },
                  { label: 'Pay', icon: '▫' },
                  { label: 'Automations', icon: '▫', badge: '2' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] ${item.active ? 'bg-[#191919] text-white' : 'text-[#8F8F8F]'}`}
                  >
                    {item.label}
                    {item.dot && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#60a5fa]" />}
                    {item.badge && <span className="ml-auto text-[9px] bg-[#3CC14E] text-black px-1 rounded-full font-semibold">{item.badge}</span>}
                  </div>
                ))}
                <p className="font-mono text-[8px] tracking-[0.1em] uppercase text-[#707070] px-2.5 mt-3 mb-1.5">Account</p>
                {['Goals', 'Reports', 'Contacts', 'Store', 'Settings'].map((item) => (
                  <div key={item} className="px-2.5 py-1.5 text-[11px] text-[#8F8F8F]">
                    {item}
                    {item === 'Store' && <span className="text-[8px] text-[#707070] ml-1.5">SOON</span>}
                  </div>
                ))}
                <p className="font-mono text-[8px] tracking-[0.1em] uppercase text-[#707070] px-2.5 mt-3 mb-1.5">Conversations</p>
                <div className="px-2.5 py-1.5 text-[10px] text-white">Save $1 USDC into Savings. <span className="text-[#707070] block text-[9px]">4 msgs · 4m ago</span></div>
                <div className="px-2.5 py-1.5 text-[10px] text-[#8F8F8F]">Balance and health factor <span className="text-[#707070] block text-[9px]">16 msgs · 20m ago</span></div>
                <div className="mt-auto pt-3 border-t border-[#363636]">
                  <div className="text-[10px] text-[#8F8F8F]">funkiirabu@gmail.com</div>
                  <div className="text-[9px] text-[#707070] font-mono mt-0.5">0x7f20...f6dc</div>
                  <div className="font-mono text-[8px] text-[#707070] mt-2">BUDGET <span className="text-white ml-2">$0.42</span> · ~52d</div>
                </div>
              </div>

              {/* Main content area */}
              <div className="flex-1 flex flex-col">
                {/* Balance header */}
                <div className="text-center py-4 border-b border-[#363636]">
                  <div className="text-[36px] font-semibold text-white tracking-tight leading-none">$107.31</div>
                  <div className="flex items-center justify-center gap-2 mt-1.5 font-mono text-[10px] text-[#8F8F8F]">
                    <span>available $106</span>
                    <span>·</span>
                    <span>earning $1</span>
                    <span>·</span>
                    <span className="text-[#f97316]">DEBT $0 ▾</span>
                  </div>
                </div>

                {/* Proactive insight card */}
                <div className="mx-4 mt-3 bg-[#191919] border border-[#363636] rounded-lg p-3 flex items-start gap-3">
                  <span className="text-[#3CC14E] text-[14px] mt-0.5">✦</span>
                  <div className="flex-1">
                    <div className="text-[12px] text-[#E5E5E5] leading-[1.6]">
                      <strong className="text-white">I&apos;ve been watching your wallet.</strong> You&apos;ve saved ~$50 three Fridays in a row. Want me to automate it?
                    </div>
                  </div>
                  <span className="text-[10px] text-[#8F8F8F] border border-[#363636] px-2 py-1 rounded shrink-0">REVIEW →</span>
                </div>

                {/* Chat / Activity tabs */}
                <div className="flex gap-3 px-4 mt-3 border-b border-[#363636]">
                  <span className="text-[11px] text-white px-1 pb-2 border-b border-white">CHAT</span>
                  <span className="text-[11px] text-[#8F8F8F] px-1 pb-2">ACTIVITY <span className="inline-block w-1 h-1 rounded-full bg-[#60a5fa] ml-0.5 -translate-y-0.5" /></span>
                </div>

                {/* Feed content */}
                <div className="flex-1 overflow-hidden px-4 py-3 space-y-2.5">
                  {/* Greeting divider */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-[#363636]" />
                    <span className="font-mono text-[9px] text-[#707070] tracking-wider uppercase">Good afternoon, funkiirabu</span>
                    <div className="flex-1 h-px bg-[#363636]" />
                  </div>

                  {/* Handled for you */}
                  <div className="bg-[rgba(60,193,78,0.06)] border border-[rgba(60,193,78,0.18)] rounded-lg p-3">
                    <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-[#3CC14E] mb-2">Handled for you</div>
                    {[
                      'Auto-saved $50 USDC · Friday 9am',
                      'Payment received · Logo design $50 · pay/abc123',
                      'Store sale · Japanese woodblock pack · $13.80 earned',
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2 py-1">
                        <span className="text-[10px] text-[#3CC14E]">✓</span>
                        <span className="text-[11px] text-[#8F8F8F]">{item}</span>
                      </div>
                    ))}
                  </div>

                  {/* Income received nudge */}
                  <div className="bg-[rgba(60,193,78,0.06)] border border-[rgba(60,193,78,0.18)] rounded-lg p-3">
                    <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-[#3CC14E] mb-2">Income received</div>
                    <div className="text-[12px] text-[#8F8F8F] leading-[1.6] mb-2.5">
                      You received <strong className="text-[#E5E5E5]">$63.80</strong> this week — $50 from a payment link and $13.80 from your store. It&apos;s all sitting idle. Save it to start earning 4.3% APY?
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[10px] bg-white text-black px-3 py-1.5 rounded font-semibold">SAVE $63.80 →</span>
                      <span className="text-[10px] text-[#8F8F8F] border border-[#363636] px-3 py-1.5 rounded">GOAL →</span>
                      <span className="text-[10px] text-[#8F8F8F] border border-[#363636] px-3 py-1.5 rounded">KEEP</span>
                    </div>
                  </div>
                </div>

                {/* Proactive chips row */}
                <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
                  {[
                    { label: 'SAVE $106 IDLE — 4.3%', icon: '💰' },
                    { label: 'MY POSITIONS', icon: '📊' },
                    { label: 'RISK ANALYSIS', icon: '🍷' },
                    { label: '+ AUTOMATIONS (2)' },
                  ].map((chip) => (
                    <span key={chip.label} className="font-mono text-[9px] px-2.5 py-1.5 bg-[#191919] border border-[#363636] rounded-full text-[#E5E5E5]">
                      {chip.icon && <span className="mr-1">{chip.icon}</span>}{chip.label}
                    </span>
                  ))}
                </div>

                {/* Product chips row */}
                <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
                  {['SAVE', 'SEND', 'SWAP', 'ASK', 'CREDIT', 'RECEIVE', 'CHARTS'].map((chip) => (
                    <span key={chip} className="font-mono text-[9px] px-2.5 py-1 border border-[#363636] rounded-full text-[#8F8F8F]">{chip}</span>
                  ))}
                </div>

                {/* Input bar */}
                <div className="px-4 pb-3 flex gap-2 items-center">
                  <span className="text-[14px] text-[#707070]">+</span>
                  <div className="flex-1 bg-[#191919] border border-[#363636] rounded-lg px-3 py-2.5 text-[12px] text-[#707070]">
                    Ask anything...
                  </div>
                  <span className="text-[10px] text-[#707070]">New</span>
                  <div className="w-8 h-8 bg-[#363636] rounded-full flex items-center justify-center text-[12px] text-[#8F8F8F]">↑</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── S3: How it works ── */}
      <section id="how" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
            How it works
          </p>
          <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-10">
            Three steps to your money.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border border-border">
            {[
              { num: '01', title: 'Sign in with Google', desc: 'No seed phrase. No wallet download. Your Audric Passport is ready in 3 seconds via zkLogin.' },
              { num: '02', title: 'Your agent thinks, then acts', desc: 'Audric evaluates your request, checks safety guards, explains its reasoning, then executes — transparently.' },
              { num: '03', title: 'Wake up to results', desc: 'Morning briefings, auto-compound summaries, goal progress, anomaly alerts. Your money works while you sleep.' },
            ].map((step) => (
              <div key={step.num} className="bg-background p-6 sm:p-7">
                <div className="font-mono text-[32px] font-medium text-border-bright mb-3">{step.num}</div>
                <div className="text-[15px] font-semibold text-foreground mb-2">{step.title}</div>
                <p className="text-[13px] text-muted leading-[1.7]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S4: Products ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
            Products
          </p>
          <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-10">
            Everything you need.
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border border border-border">
            {PRODUCTS.map((p) => (
              <div
                key={p.name}
                className="bg-surface p-5 text-center"
              >
                <div className="text-[20px] mb-2">{p.icon}</div>
                <div className="text-[13px] font-semibold text-foreground mb-1">{p.name}</div>
                <p className="text-[13px] text-muted leading-[1.7]">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S5: Move Money + Send Mockup ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
              Send &amp; receive
            </p>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              Move money.<br />Free. Global. Instant.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7] max-w-[420px] mb-5">
              Send USDC to anyone, anywhere. Payment links for your business. Invoices that settle in seconds. No bank. No borders. No fees.
            </p>

            <div className="grid grid-cols-4 gap-px bg-border border border-border mb-5">
              {[
                { value: '$0', label: 'Fees' },
                { value: '<1s', label: 'Settlement' },
                { value: '∞', label: 'No limits' },
                { value: 'USDC', label: 'Stablecoin' },
              ].map((s) => (
                <div key={s.label} className="bg-background px-3 py-3 text-center">
                  <div className="text-[18px] font-semibold text-foreground leading-none mb-1">{s.value}</div>
                  <div className="font-mono text-[10px] text-muted">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-px bg-border border border-border">
              {[
                { icon: '→', title: 'Send to anyone', desc: '"Send $50 to alice" — 0.4s' },
                { icon: '🔗', title: 'Payment links', desc: 'Share a link, get USDC' },
                { icon: '📄', title: 'Invoices', desc: 'Settle on-chain instantly' },
              ].map((uc) => (
                <div key={uc.title} className="bg-background p-4 text-center">
                  <div className="text-[16px] mb-1.5">{uc.icon}</div>
                  <div className="text-[11px] font-semibold text-foreground mb-1">{uc.title}</div>
                  <p className="font-mono text-[10px] text-muted">{uc.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Send flow mockup — white shell */}
          <div className="border border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-border flex items-center gap-1.5">
              <span className="text-[10px] text-muted">◎ Send</span>
              <span className="ml-auto text-[9px] text-dim">Audric Dashboard</span>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="bg-surface border border-border rounded-md px-3 py-2.5">
                <div className="text-[11px] text-muted mb-1">You said:</div>
                <div className="text-[13px] text-foreground">&quot;Send $50 to alice&quot;</div>
              </div>
              <div className="border border-border rounded-md p-3">
                <div className="text-[10px] text-[#00D68F] mb-2">✓ Confirm transfer</div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] text-muted">To</span>
                  <span className="text-[11px] text-foreground">alice (0x7f20...f6dc)</span>
                </div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] text-muted">Amount</span>
                  <span className="text-[11px] text-foreground font-semibold">$50.00 USDC</span>
                </div>
                <div className="flex justify-between mb-2.5">
                  <span className="text-[11px] text-muted">Fee</span>
                  <span className="text-[11px] text-[#00D68F]">$0.00</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex-1 bg-foreground text-background text-center py-1.5 rounded text-[10px] font-semibold">Send →</div>
                  <div className="py-1.5 px-3 border border-border rounded text-[10px] text-muted">Cancel</div>
                </div>
              </div>
              <div className="bg-surface border border-border rounded-md px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-[#00D68F]">✓ Sent</span>
                  <span className="ml-auto text-[9px] text-dim">0.4s</span>
                </div>
                <div className="text-[11px] text-foreground">$50.00 USDC → alice</div>
                <div className="font-mono text-[9px] text-muted mt-0.5">Tx: suiscan.xyz/tx/9kLm...bR2z</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── S6: Audric Intelligence (5 pillars) ── */}
      <section id="intelligence" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
              Audric Intelligence
            </p>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              Not a chatbot.<br />A financial agent.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7] max-w-[500px] mx-auto">
              Five systems work together to understand your money, reason about decisions, act autonomously, and get smarter over time.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-border border border-border">
            {INTELLIGENCE_PILLARS.map((p) => (
              <div key={p.title} className="bg-background p-5 text-center">
                <div className="text-[24px] mb-3">{p.icon}</div>
                <div className="text-[14px] font-semibold text-foreground mb-1">{p.title}</div>
                <div className="text-[12px] italic text-muted mb-2.5">{p.sub}</div>
                <p className="text-[13px] text-muted leading-[1.7]">{p.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── S7: Audric Passport ── */}
      <section id="passport" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
            Audric Passport
          </p>
          <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-10">
            Your passport to a new kind of finance.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
            {PASSPORT_PILLARS.map((p) => (
              <div key={p.title} className="bg-background p-6">
                <div className="text-[20px] mb-2.5">{p.icon}</div>
                <div className="text-[13px] font-semibold text-foreground mb-2">{p.title}</div>
                <p className="text-[13px] text-muted leading-[1.7]">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <button
              onClick={login}
              className="bg-foreground text-background px-7 py-3.5 font-mono text-[11px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
            >
              Sign in with Google — get your Passport
            </button>
          </div>
        </div>
      </section>

      {/* ── S8: Audric Pay + Pay Flow Mockup ── */}
      <section id="pay" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 border-t border-border">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
              Audric Pay
            </p>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              Your agent pays so you don&apos;t have to.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7] max-w-[420px] mb-5">
              Give Audric a budget. It accesses 41 AI services on your behalf — music, images, research, data. No subscriptions. No API keys.
            </p>
            <div className="grid grid-cols-3 gap-px bg-border border border-border mb-4">
              {[
                { value: '41', label: 'Services' },
                { value: '90+', label: 'Endpoints' },
                { value: '$0.001', label: 'From' },
              ].map((s) => (
                <div key={s.label} className="bg-surface px-3 py-3 text-center">
                  <div className="text-[18px] font-semibold text-foreground leading-none mb-1">{s.value}</div>
                  <div className="font-mono text-[10px] text-muted">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="font-mono text-[10px] text-dim">
              Powered by suimpp · On Sui
            </div>
          </div>

          {/* Pay flow mockup — white shell */}
          <div className="border border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-border flex items-center gap-1.5">
              <span className="text-[10px] text-muted">◎ Pay</span>
              <span className="ml-auto text-[9px] text-dim">Audric Dashboard</span>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="bg-surface border border-border rounded-md px-3 py-2.5">
                <div className="text-[11px] text-muted mb-1">You said:</div>
                <div className="text-[13px] text-foreground">&quot;Send a birthday postcard to my mum&quot;</div>
              </div>
              <div className="divide-y divide-border">
                {[
                  { label: 'Wrote a personal message', service: 'OpenAI', cost: '$0.02' },
                  { label: 'Designed the card', service: 'DALL-E 3', cost: '$0.04' },
                  { label: 'Printed and mailed it', service: 'Lob', cost: '$0.99' },
                ].map((step) => (
                  <div key={step.label} className="flex items-center gap-2 py-2">
                    <span className="text-[10px] text-[#00D68F]">✓</span>
                    <span className="flex-1 text-[11px] text-foreground">{step.label}</span>
                    <span className="text-[9px] text-muted">{step.service} · {step.cost}</span>
                  </div>
                ))}
              </div>
              <div className="bg-surface border border-border rounded-md px-3 py-2.5 flex justify-between items-center">
                <span className="text-[11px] text-foreground">Postcard on its way 💌</span>
                <span className="text-[13px] font-semibold text-foreground">$1.05</span>
              </div>
              <div className="flex justify-between text-[9px] text-muted">
                <span>Budget: $0.35 / $1.00</span>
                <span>3 services used</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── S9: Audric Store + Store Flow Mockup ── */}
      <section id="store" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
              Audric Store
            </p>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              The new app store.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7] max-w-[420px] mb-5">
              Create and sell any digital content. Get paid in USDC. No middleman. 92% to you.
            </p>
            <div className="flex gap-1.5 flex-wrap mb-4">
              {['Music', 'Art', 'Ebooks', 'Templates', 'Courses'].map((tag) => (
                <span key={tag} className="font-mono text-[10px] px-2.5 py-1 border border-border rounded-full text-muted">{tag}</span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-px bg-border border border-border mb-5">
              {[
                { title: 'Permanent', desc: 'Files on Walrus' },
                { title: 'Pay-to-unlock', desc: 'On-chain gating' },
                { title: '92% to you', desc: 'Instant USDC' },
              ].map((feat) => (
                <div key={feat.title} className="bg-background px-3 py-2.5 text-center">
                  <div className="text-[10px] font-semibold text-foreground mb-0.5">{feat.title}</div>
                  <p className="font-mono text-[10px] text-muted">{feat.desc}</p>
                </div>
              ))}
            </div>
            <button
              onClick={login}
              className="bg-foreground text-background px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
            >
              Join the waitlist →
            </button>
          </div>

          {/* Store flow mockup — white shell */}
          <div className="border border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-border flex items-center gap-1.5">
              <span className="text-[10px] text-muted">◎ Store</span>
              <span className="ml-auto text-[9px] text-dim">Audric Dashboard</span>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="bg-surface border border-border rounded-md px-3 py-2.5">
                <div className="text-[11px] text-muted mb-1">You said:</div>
                <div className="text-[13px] text-foreground">&quot;Make me a lo-fi track called Midnight Rain&quot;</div>
              </div>
              <div className="divide-y divide-border">
                {[
                  { label: 'Generated lo-fi track (2:34)', service: 'Suno', cost: '$0.05' },
                  { label: 'Created album cover', service: 'DALL-E 3', cost: '$0.04' },
                  { label: 'Uploaded to Walrus', service: '', cost: 'permanent' },
                ].map((step) => (
                  <div key={step.label} className="flex items-center gap-2 py-2">
                    <span className="text-[10px] text-[#00D68F]">✓</span>
                    <span className="flex-1 text-[11px] text-foreground">{step.label}</span>
                    <span className="text-[9px] text-muted">{step.service}{step.service && ' · '}{step.cost}</span>
                  </div>
                ))}
              </div>
              <div className="bg-surface border border-border rounded-md px-3 py-2.5">
                <div className="text-[11px] text-muted mb-1">You said:</div>
                <div className="text-[13px] text-foreground">&quot;Sell this for $3&quot;</div>
              </div>
              <div className="border border-border rounded-md p-3">
                <div className="text-[10px] text-[#00D68F] mb-2">✓ Listed on Audric Store</div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-muted">Track</span>
                  <span className="text-[11px] text-foreground">Midnight Rain</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-muted">Price</span>
                  <span className="text-[11px] text-foreground font-semibold">$3.00 USDC</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-muted">You earn</span>
                  <span className="text-[11px] text-[#00D68F]">$2.76 (92%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted">Link</span>
                  <span className="text-[11px] text-foreground font-mono">audric.ai/store/mR7k</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── S10: Stats + CTA ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-[700px] mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
            {[
              { value: fmtStat(stats?.totalUsers), label: 'Users' },
              { value: fmtStat(stats?.totalTransactions), label: 'On-chain txs' },
              { value: fmtStat(stats?.totalToolExecutions), label: 'Tool calls' },
              { value: fmtStat(stats?.totalTokens), label: 'Tokens processed' },
            ].map((stat) => (
              <div key={stat.label} className="bg-background px-4 py-5 text-center">
                <div className="text-[28px] font-semibold text-foreground leading-none mb-1 tracking-[-1px]">{stat.value}</div>
                <div className="font-mono text-[10px] text-muted">{stat.label}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2 mt-5 flex-wrap">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase px-2.5 py-1 border border-border text-muted">Built on Sui</span>
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase px-2.5 py-1 border border-border text-muted">Non-custodial</span>
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase px-2.5 py-1 border border-border text-muted">Open Source</span>
          </div>
          <div className="text-center mt-8">
            <button
              onClick={login}
              className="bg-foreground text-background px-8 py-3.5 font-mono text-[12px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
            >
              Sign in with Google →
            </button>
            <p className="font-mono text-[10px] text-muted mt-2">Free to start. No credit card.</p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-5 sm:px-10 lg:px-16 py-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
            <div className="text-center sm:text-left">
              <div className="font-mono text-[13px] font-medium text-foreground mb-1">Audric</div>
              <div className="font-mono text-[10px] text-muted">Start managing your money.</div>
            </div>

            <button
              onClick={login}
              className="bg-foreground text-background px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
            >
              Sign in with Google →
            </button>

            <div className="flex gap-4 flex-wrap justify-center">
              <a href="https://t2000.ai" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">t2000.ai</a>
              <a href="https://suimpp.dev" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">suimpp.dev</a>
              <a href="https://github.com/mission69b/t2000" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">GitHub</a>
              <a href="https://x.com/AudricAI" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">X</a>
              <a href="https://discord.gg/qE95FPt6Z5" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">Discord</a>
              <Link href="/terms" className="font-mono text-[10px] text-dim hover:text-muted transition">Terms</Link>
              <Link href="/privacy" className="font-mono text-[10px] text-dim hover:text-muted transition">Privacy</Link>
              <Link href="/disclaimer" className="font-mono text-[10px] text-dim hover:text-muted transition">Disclaimer</Link>
              <Link href="/security" className="font-mono text-[10px] text-dim hover:text-muted transition">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
