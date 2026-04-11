import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { isValidSuiAddress } from '@mysten/sui/utils';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const T2000_PACKAGE = '0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad';
const ALLOWANCE_TYPE_PREFIX = `${T2000_PACKAGE}::allowance::Allowance`;

let _client: SuiJsonRpcClient | null = null;
function getClient() {
  if (!_client) _client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });
  return _client;
}

interface ObjectChange {
  type: string;
  objectType?: string;
  objectId?: string;
}

/**
 * GET /api/user/allowance-discovery?address=0x...
 *
 * Searches the user's on-chain transaction history for an Allowance<USDC>
 * object, then verifies it still exists and the user is the owner.
 * Returns { allowanceId, balance } or { allowanceId: null }.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const client = getClient();

    // Scan recent transactions for allowance object changes
    const txResult = await client.queryTransactionBlocks({
      filter: { FromAddress: address },
      options: { showObjectChanges: true },
      limit: 50,
      order: 'descending',
    });

    const candidates = new Set<string>();
    for (const tx of txResult.data) {
      for (const change of (tx.objectChanges ?? []) as ObjectChange[]) {
        if (change.objectType?.startsWith(ALLOWANCE_TYPE_PREFIX) && change.objectId) {
          candidates.add(change.objectId);
        }
      }
    }

    if (candidates.size === 0) {
      return NextResponse.json({ allowanceId: null, balance: null });
    }

    // Verify each candidate: must still exist and be owned by this address
    for (const id of candidates) {
      try {
        const obj = await client.getObject({ id, options: { showContent: true } });
        if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') continue;

        const fields = obj.data.content.fields as Record<string, unknown>;
        if (fields.owner !== address) continue;

        const rawBalance = fields.balance;
        const balance = typeof rawBalance === 'string' ? Number(BigInt(rawBalance)) / 1e6 : 0;

        return NextResponse.json({ allowanceId: id, balance });
      } catch {
        continue;
      }
    }

    return NextResponse.json({ allowanceId: null, balance: null });
  } catch (err) {
    console.error('[allowance-discovery] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ allowanceId: null, balance: null });
  }
}
