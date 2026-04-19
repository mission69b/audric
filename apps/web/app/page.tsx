'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/LandingNav';
import { MockChatDemo } from '@/components/landing/MockChatDemo';
import { useZkLogin } from '@/components/auth/useZkLogin';

const FINANCE_FEATURES = [
  { icon: '◎', name: 'Save', desc: 'Earn 3–8% APY on USDC via NAVI. Withdraw anytime.' },
  { icon: '⊞', name: 'Credit', desc: 'Borrow against savings. Health factor visible at all times.' },
  { icon: '⇌', name: 'Swap', desc: 'Convert tokens. Best-route via 20+ DEXs. 0.1% fee.' },
  { icon: '📊', name: 'Charts', desc: 'Interactive visualizations from conversation. Yield, health, portfolio.' },
];

const PAY_FEATURES = [
  { icon: '→', name: 'Send', desc: 'Instant USDC transfers. Free. Sub-second. Global.' },
  { icon: '↙', name: 'Receive', desc: 'Payment links, QR codes, invoices. Accept USDC from anyone.' },
];

const PASSPORT_PILLARS = [
  { icon: '🪪', title: 'Identity', desc: 'Sign in with Google. Your Passport is a cryptographic wallet, created in 3 seconds. No seed phrase. Yours forever.' },
  { icon: '✋', title: 'You decide', desc: 'Audric never moves money on its own. Every save, send, swap, and borrow waits on your tap-to-confirm.' },
  { icon: '🔐', title: 'Sponsored gas', desc: 'We pay the network fees so you don\'t need SUI to transact. Your USDC stays your USDC.' },
  { icon: '⛓️', title: 'Yours', desc: 'Non-custodial. We cannot move your money. Every transaction is on Sui mainnet, verifiable by anyone, forever.' },
];

const INTELLIGENCE_PILLARS = [
  { icon: '🎛️', title: 'Agent Harness', sub: '40 tools. One agent.', desc: 'The runtime that manages your money: balances, DeFi, analytics, payments — all orchestrated by a single conversation.' },
  { icon: '⚡', title: 'Reasoning Engine', sub: 'Thinks before it acts.', desc: 'Classifies complexity, matches skill recipes, runs 9 safety guards before every transaction. You see its reasoning.' },
  { icon: '🧠', title: 'Silent Profile', sub: 'Knows your finances.', desc: 'Builds a private financial profile from your chat history. Used silently to make answers more relevant — never surfaced as nudges.' },
  { icon: '🔗', title: 'Chain Memory', sub: 'Remembers what you do on-chain.', desc: 'Reads your wallet history into structured facts the agent uses as context — recurring sends, idle balances, position changes.' },
  { icon: '📓', title: 'AdviceLog', sub: 'Remembers what it told you.', desc: 'Every recommendation Audric makes is logged so it doesn\'t contradict itself across sessions. No two answers about the same topic.' },
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
              { num: '02', title: 'Just say what you want', desc: 'Save $50, send to alice, what\'s my health factor? — Audric understands plain English. No menus, no forms.' },
              { num: '03', title: 'Confirm, and it\'s done', desc: 'You see the action, the amount, the impact. One tap to confirm — Audric pays the gas, signs the transaction, and shows you the result.' },
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

      {/* ── S4: Audric Finance ── */}
      <section id="finance" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
            Audric Finance
          </p>
          <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
            Your money, working on Sui.
          </h2>
          <p className="text-[13px] text-muted leading-[1.7] max-w-[500px] mb-10">
            Save, borrow, swap, see your positions — every DeFi op a user can do, all by asking in chat. The Agent Harness picks the right tool, the Reasoning Engine clears the guards, and your Passport taps to confirm.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
            {FINANCE_FEATURES.map((p) => (
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

      {/* ── S5: Audric Pay + Send Mockup ── */}
      <section id="pay" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
              Audric Pay
            </p>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              Move money.<br />Free. Global. Instant.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7] max-w-[420px] mb-5">
              Send USDC to anyone, anywhere. Receive via payment links, QR codes, or invoices. No bank. No borders. No fees.
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

            <div className="grid grid-cols-2 gap-px bg-border border border-border">
              {PAY_FEATURES.map((p) => (
                <div key={p.name} className="bg-background p-4 text-center">
                  <div className="text-[16px] mb-1.5">{p.icon}</div>
                  <div className="text-[11px] font-semibold text-foreground mb-1">{p.name}</div>
                  <p className="font-mono text-[10px] text-muted leading-[1.7]">{p.desc}</p>
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
              Five systems work together to understand your money, reason about decisions, and get smarter over time. Every action still waits on your confirmation.
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

      {/* ── S9: Audric Store + Store Flow Mockup ── */}
      <section id="store" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted">
                Audric Store
              </p>
              <span className="font-mono text-[8px] tracking-[0.15em] uppercase text-foreground border border-border-bright px-2 py-0.5">
                Coming soon
              </span>
            </div>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              The new app store.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7] max-w-[420px] mb-5">
              Create and sell any digital content. Get paid in USDC. No middleman. 92% to you. Phase 5 — preview below.
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
