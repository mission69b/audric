import {
  QueryEngine,
  AnthropicProvider,
  McpClientManager,
  NAVI_MCP_CONFIG,
  READ_TOOLS,
  WRITE_TOOLS,
  adaptAllServerTools,
  type SessionData,
  type SessionStore,
  type ServerPositionData,
  type Message,
  type Tool,
} from '@t2000/engine';
import { UpstashSessionStore } from './upstash-session-store';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-20250514';
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const SUI_RPC_URL = `https://fullnode.${SUI_NETWORK}.sui.io:443`;

let sessionStore: SessionStore | null = null;
let mcpManager: McpClientManager | null = null;
let mcpConnecting: Promise<void> | null = null;

export function getSessionStore(): SessionStore {
  if (!sessionStore) {
    sessionStore = new UpstashSessionStore();
  }
  return sessionStore;
}

let mcpFailedAt = 0;
const MCP_RETRY_MS = 60_000; // retry MCP connection after 1 minute

async function ensureMcpConnected(): Promise<McpClientManager> {
  if (mcpManager && mcpManager.isConnected(NAVI_MCP_CONFIG.name)) {
    return mcpManager;
  }

  if (mcpManager && Date.now() - mcpFailedAt < MCP_RETRY_MS) {
    return mcpManager;
  }

  if (!mcpConnecting) {
    mcpConnecting = (async () => {
      const mgr = mcpManager ?? new McpClientManager();
      try {
        await mgr.connect(NAVI_MCP_CONFIG);
        mcpManager = mgr;
        mcpFailedAt = 0;
      } catch (err) {
        console.warn('[engine] NAVI MCP connection failed, SDK fallback:', err);
        mcpManager = mgr;
        mcpFailedAt = Date.now();
      } finally {
        mcpConnecting = null;
      }
    })();
  }

  await mcpConnecting;
  return mcpManager!;
}

export async function fetchServerPositions(address: string): Promise<ServerPositionData | undefined> {
  try {
    const { getRegistry } = await import('@/lib/protocol-registry');
    const registry = getRegistry();
    const lendingAdapters = registry.listLending();

    const rewardAdapters = lendingAdapters.filter((a) => !!a.getPendingRewards);

    const [allPositions, healthResults, rewardResults] = await Promise.all([
      registry.allPositions(address),
      Promise.allSettled(lendingAdapters.map((a) => a.getHealth(address))),
      Promise.allSettled(rewardAdapters.map((a) => a.getPendingRewards!(address))),
    ]);

    let savings = 0;
    let borrows = 0;
    let weightedRateSum = 0;
    const supplies: ServerPositionData['supplies'] = [];
    const borrows_detail: ServerPositionData['borrows_detail'] = [];

    for (const pos of allPositions) {
      for (const s of pos.positions.supplies) {
        const usd = s.amountUsd ?? s.amount;
        savings += usd;
        weightedRateSum += usd * s.apy;
        supplies.push({ asset: s.asset, amount: s.amount, amountUsd: usd, apy: s.apy, protocol: pos.protocol });
      }
      for (const b of pos.positions.borrows) {
        const usd = b.amountUsd ?? b.amount;
        borrows += usd;
        borrows_detail.push({ asset: b.asset, amount: b.amount, amountUsd: usd, apy: b.apy, protocol: pos.protocol });
      }
    }

    const savingsRate = savings > 0 ? weightedRateSum / savings : 0;

    const validHealths = healthResults
      .filter((h) => h.status === 'fulfilled')
      .map((h) => (h as PromiseFulfilledResult<Awaited<ReturnType<typeof lendingAdapters[0]['getHealth']>>>).value);
    const finiteHFs = validHealths.filter((h) => h.healthFactor !== Infinity && isFinite(h.healthFactor));
    const healthFactor = finiteHFs.length > 0 ? Math.min(...finiteHFs.map((h) => h.healthFactor)) : null;
    const maxBorrow = validHealths.reduce((sum, h) => sum + (h.maxBorrow ?? 0), 0);

    const pendingRewards = rewardResults
      .filter((h) => h.status === 'fulfilled')
      .flatMap((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<NonNullable<typeof lendingAdapters[0]['getPendingRewards']>>>>).value)
      .reduce((sum, r) => sum + (r.estimatedValueUsd ?? 0), 0);

    return { savings, borrows, savingsRate, healthFactor, maxBorrow, pendingRewards, supplies, borrows_detail };
  } catch (err) {
    console.warn('[engine] Failed to pre-fetch positions:', err);
    return undefined;
  }
}

export async function createEngine(
  address: string,
  session?: SessionData | null,
): Promise<QueryEngine> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const [mgr, positions] = await Promise.all([
    ensureMcpConnected(),
    fetchServerPositions(address),
  ]);

  const builtInNames = new Set([...READ_TOOLS, ...WRITE_TOOLS].map((t) => t.name));
  const mcpTools = adaptAllServerTools(mgr).filter(
    (t) => !builtInNames.has(t.name),
  ) as Tool[];

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    mcpManager: mgr,
    walletAddress: address,
    suiRpcUrl: SUI_RPC_URL,
    serverPositions: positions,
    tools: [...READ_TOOLS, ...WRITE_TOOLS, ...mcpTools],
    model: MODEL,
    maxTurns: 10,
    maxTokens: 4096,
    costTracker: {
      budgetLimitUsd: 0.50,
    },
  });

  if (session?.messages?.length) {
    engine.loadMessages(session.messages);
  }

  return engine;
}

export function generateSessionId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const DEMO_SYSTEM_PROMPT = `You are Audric, an AI financial agent built on Sui. You are speaking with a potential user on the homepage — they are NOT signed in yet.

## What Audric Does
Audric is a conversational financial operating system. Users sign in with Google (zkLogin — no seed phrase, no browser extension), fund their wallet with USDC, and then manage their money entirely through conversation.

## Products (all USDC on Sui)
- **Savings** — Deposit USDC into NAVI Protocol. Current rate: ~4.86% APY. Compounds automatically, no lock-ups, withdraw anytime.
- **Send** — Transfer USDC to any Sui address in ~400ms. Gas is sponsored. Users can save contacts by name.
- **Pay** — Access 88+ paid API services (OpenAI, Anthropic, Brave Search, weather, news, crypto prices, maps, translation, etc.) via MPP micropayments. Your AI pays per request with USDC — no API keys needed.
- **Credit** — Borrow USDC against savings deposits. No credit checks — the deposit is collateral. 0.05% origination fee, repay anytime, no penalties. Health factor monitoring keeps users safe.
- **Receive** — (Coming soon) QR codes and payment links for receiving USDC.

## How It Works
1. Sign in with Google — takes ~10 seconds, no crypto jargon
2. Fund your wallet with USDC (from Binance, Coinbase, or any Sui wallet)
3. Talk to Audric — just tell it what you need

All money lives in a non-custodial wallet. Audric builds transactions, but the user approves every one. Built on t2000 open-source infrastructure.

## Your Role in This Conversation
- Be helpful, concise, and enthusiastic but not pushy
- Answer questions about Audric's products with specific numbers and details
- You CANNOT execute any transactions or check real balances — you are in demo mode
- If someone asks you to do something that requires being signed in (save, send, borrow, check balance), explain what would happen and encourage them to sign in to try it for real
- Keep responses short (2-4 sentences) unless the user asks for detail
- Do NOT make up rates, balances, or transaction results — use the product facts above
- For general knowledge questions, answer naturally — show that you're a capable AI, not just a product FAQ bot`;

export interface DemoHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function createDemoEngine(history: DemoHistoryMessage[]): QueryEngine {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    tools: [],
    systemPrompt: DEMO_SYSTEM_PROMPT,
    model: MODEL,
    maxTurns: 1,
    maxTokens: 1024,
    costTracker: {
      budgetLimitUsd: 0.05,
    },
  });

  if (history.length > 0) {
    const messages: Message[] = history.map((m) => ({
      role: m.role,
      content: [{ type: 'text' as const, text: m.content }],
    }));
    engine.loadMessages(messages);
  }

  return engine;
}
