import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryTransactionBlocks } = vi.hoisted(() => ({
  queryTransactionBlocks: vi.fn(),
}));

vi.mock('@mysten/sui/jsonRpc', () => ({
  SuiJsonRpcClient: vi.fn().mockImplementation(() => ({
    queryTransactionBlocks,
  })),
  getJsonRpcFullnodeUrl: () => 'https://fullnode.mainnet.sui.io:443',
}));

vi.mock('@/lib/sui-rpc', () => ({
  getSuiRpcUrl: () => 'https://fullnode.mainnet.sui.io:443',
}));

vi.mock('@t2000/sdk', () => ({
  extractTxCommands: (tx: unknown) => {
    const t = tx as { moveCallTargets?: string[] } | undefined;
    return { moveCallTargets: t?.moveCallTargets ?? [] };
  },
  extractTxSender: (tx: unknown) => (tx as { sender?: string } | undefined)?.sender,
  parseSuiRpcTx: (tx: { digest: string; timestampMs: string; mock?: Record<string, unknown> }) => ({
    digest: tx.digest,
    action: tx.mock?.action ?? 'send',
    label: tx.mock?.label,
    direction: tx.mock?.direction,
    amount: tx.mock?.amount,
    asset: tx.mock?.asset,
    recipient: tx.mock?.recipient,
    timestamp: Number(tx.timestampMs),
    gasCost: tx.mock?.gasCost,
  }),
}));

import { getTransactionHistory } from '../transaction-history';

const ALLOWANCE_PREFIX = '0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad';

function tx(digest: string, ts: number, opts: Record<string, unknown> = {}) {
  return {
    digest,
    timestampMs: String(ts),
    transaction: {
      sender: opts.sender,
      moveCallTargets: opts.moveCallTargets ?? [],
    },
    sender: opts.sender,
    moveCallTargets: opts.moveCallTargets ?? [],
    mock: opts,
  };
}

describe('getTransactionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges incoming + outgoing, dedupes by digest, sorts DESC by timestamp', async () => {
    queryTransactionBlocks.mockImplementation(({ filter }) => {
      if ('FromAddress' in filter) {
        return Promise.resolve({
          data: [tx('a', 200, { sender: '0xme' }), tx('b', 100, { sender: '0xme' })],
        });
      }
      return Promise.resolve({
        data: [tx('a', 200, { sender: '0xme' }), tx('c', 300, { sender: '0xother' })],
      });
    });

    const records = await getTransactionHistory('0xme');
    expect(records.map((r) => r.digest)).toEqual(['c', 'a', 'b']);
    expect(records.find((r) => r.digest === 'c')?.isUserTx).toBe(false);
    expect(records.find((r) => r.digest === 'a')?.isUserTx).toBe(true);
  });

  it('drops legacy allowance package transactions when excludeLegacyAllowance=true', async () => {
    queryTransactionBlocks.mockImplementation(({ filter }) => {
      if ('FromAddress' in filter) {
        return Promise.resolve({
          data: [
            tx('a', 100, { sender: '0xme', moveCallTargets: [`${ALLOWANCE_PREFIX}::allowance::approve`] }),
            tx('b', 200, { sender: '0xme', moveCallTargets: ['0xpackage::module::function'] }),
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const records = await getTransactionHistory('0xme');
    expect(records.map((r) => r.digest)).toEqual(['b']);
  });

  it('keeps legacy allowance transactions when excludeLegacyAllowance=false', async () => {
    queryTransactionBlocks.mockImplementation(({ filter }) => {
      if ('FromAddress' in filter) {
        return Promise.resolve({
          data: [
            tx('a', 100, { sender: '0xme', moveCallTargets: [`${ALLOWANCE_PREFIX}::allowance::approve`] }),
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const records = await getTransactionHistory('0xme', { excludeLegacyAllowance: false });
    expect(records.length).toBe(1);
  });

  it('skips outgoing query when skipOutgoing=true', async () => {
    queryTransactionBlocks.mockResolvedValue({ data: [] });
    await getTransactionHistory('0xme', { skipOutgoing: true });
    const fromCalls = queryTransactionBlocks.mock.calls.filter(
      ([opts]) => 'FromAddress' in opts.filter,
    );
    expect(fromCalls.length).toBe(0);
  });

  it('respects limit parameter', async () => {
    queryTransactionBlocks.mockImplementation(() =>
      Promise.resolve({
        data: Array.from({ length: 30 }, (_, i) => tx(`tx${i}`, 1000 - i, { sender: '0xme' })),
      }),
    );

    const records = await getTransactionHistory('0xme', { limit: 5 });
    expect(records.length).toBe(5);
  });

  it('degrades gracefully when one query throws', async () => {
    queryTransactionBlocks.mockImplementation(({ filter }) => {
      if ('FromAddress' in filter) {
        return Promise.reject(new Error('rpc boom'));
      }
      return Promise.resolve({ data: [tx('a', 100, { sender: '0xother' })] });
    });

    const records = await getTransactionHistory('0xme');
    expect(records.length).toBe(1);
    expect(records[0].digest).toBe('a');
  });

  it('populates counterparty for inbound transfers from another sender', async () => {
    queryTransactionBlocks.mockImplementation(({ filter }) => {
      if ('FromAddress' in filter) return Promise.resolve({ data: [] });
      return Promise.resolve({
        data: [tx('a', 100, { sender: '0xother', direction: 'in' })],
      });
    });

    const records = await getTransactionHistory('0xme');
    expect(records[0].counterparty).toBe('0xother');
    expect(records[0].isUserTx).toBe(false);
  });
});
