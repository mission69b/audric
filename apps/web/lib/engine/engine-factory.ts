import {
  QueryEngine,
  AnthropicProvider,
  McpClientManager,
  NAVI_MCP_CONFIG,
  READ_TOOLS,
  type SessionData,
  type SessionStore,
  type ServerPositionData,
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

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    mcpManager: mgr,
    walletAddress: address,
    suiRpcUrl: SUI_RPC_URL,
    serverPositions: positions,
    tools: READ_TOOLS,
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
