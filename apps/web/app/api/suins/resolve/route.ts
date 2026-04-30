import { NextRequest, NextResponse } from 'next/server';
import { getSuiRpcUrl } from '@/lib/sui-rpc';

export const runtime = 'nodejs';

/**
 * GET /api/suins/resolve?name=adeniyi.sui
 *
 * Resolves a SuiNS name (e.g. `adeniyi.sui`) to a Sui address by calling
 * the public `suix_resolveNameServiceAddress` JSON-RPC method against our
 * BlockVision-keyed Sui RPC endpoint. We hit the RPC directly (rather than
 * through `@mysten/suins`) to stay version-independent — the SuiNS team
 * explicitly documents that name → address resolution is covered by JSON-RPC
 * without needing the SDK.
 *
 * Response shape:
 *   200 { address: string | null, name: string }
 *   400 { error: string }                       (validation)
 *   502 { error: string }                       (RPC failure)
 *
 * `address: null` means the name is not registered. Callers must handle
 * this case as a user-facing "not registered" message — a null is NOT an
 * error condition for the route itself.
 *
 * Rate limiting: this route is unauthenticated and lightweight, but every
 * resolve call hits BlockVision. Front-end gating (executeToolAction only
 * calls this when the input matches `*.sui`) keeps the volume tiny.
 */

const SUINS_NAME_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.sui$/;

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export async function GET(req: NextRequest) {
  const rawName = req.nextUrl.searchParams.get('name');
  if (!rawName) {
    return NextResponse.json({ error: 'missing name parameter' }, { status: 400 });
  }

  const name = rawName.trim().toLowerCase();
  if (!SUINS_NAME_REGEX.test(name)) {
    return NextResponse.json(
      { error: `invalid SuiNS name: ${rawName}. Must end in .sui and contain only [a-z0-9-]` },
      { status: 400 },
    );
  }

  let rpcUrl: string;
  try {
    rpcUrl = getSuiRpcUrl();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `RPC config error: ${msg}` }, { status: 500 });
  }

  let res: Response;
  try {
    res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_resolveNameServiceAddress',
        params: [name],
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `RPC fetch failed: ${msg}` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `RPC HTTP ${res.status}` },
      { status: 502 },
    );
  }

  let body: JsonRpcResponse<string | null>;
  try {
    body = (await res.json()) as JsonRpcResponse<string | null>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `RPC JSON parse failed: ${msg}` },
      { status: 502 },
    );
  }

  if (body.error) {
    return NextResponse.json(
      { error: `RPC error: ${body.error.message}` },
      { status: 502 },
    );
  }

  // result is the resolved 0x...64-hex address, or null when the name has
  // never been registered (or has expired and the record was reaped).
  const address = body.result ?? null;

  return NextResponse.json({ address, name });
}
