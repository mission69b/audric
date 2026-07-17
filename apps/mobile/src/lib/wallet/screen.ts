import * as SecureStore from "expo-secure-store";

// Pre-dispatch checks. NOT the authorization gate (the tap-to-confirm is) — these
// catch fat-finger errors and accidental double-taps before we build a tx.
export const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;
const DEDUP_WINDOW_MS = 60_000;

type SendInput = { to: string; amountRaw: bigint; asset: "SUI" | "USDC" };

export function preflightSend(input: SendInput): { ok: true } | { ok: false; reason: string } {
  if (!SUI_ADDRESS.test(input.to)) {
    return { ok: false, reason: "Enter a valid Sui address." };
  }
  // Authoritative amount check is on the RAW integer (parsed exactly upstream), so a
  // sub-unit or zero amount can never slip through as a rounded value.
  if (input.amountRaw <= 0n) {
    return { ok: false, reason: "Enter an amount greater than zero." };
  }
  return { ok: true };
}

// Canonical dedup key. Keyed on RAW units (integer MIST) so `0.1` and `0.10` map to
// the same key, and namespaced by network + sender so distinct chains/wallets can
// never collide (mainnet/testnet keep separate epoch counters and balances). The
// float `amount` is NEVER part of the key — only its canonical integer raw value.
export function sendDedupKey(input: {
  network: string;
  sender: string;
  to: string;
  amountRaw: bigint;
  asset: "SUI" | "USDC";
}): string {
  return `${input.network}:${input.sender}:${input.asset}:${input.to}:${input.amountRaw.toString()}`;
}

// In-memory dispatch log — the ATOMIC guard. `isDuplicateSend` + `markSendDispatched`
// are synchronous, so a caller that checks-then-marks with NO `await` between the two
// closes the window where two concurrent `sendSui()` calls could both pass the check
// before either marks (single-threaded JS runs that pair to completion uninterrupted).
const lastDispatch = new Map<string, number>();

// Durable mirror in SecureStore so the dedup window survives a process restart: a tx
// that was broadcast but whose outcome is unconfirmed (app killed mid-send) must not
// become retryable just because the in-memory map was lost. `hydrateDedup` pulls the
// persisted marks back into memory before the check; `persistDedup` writes the pruned
// map after every mark/clear. Both are best-effort (a storage failure must never block
// or crash a send) — the in-memory guard still holds within the live process.
const DEDUP_STORE_KEY = "audric-send-dedup";

export function markSendDispatched(key: string, nowMs: number = Date.now()): void {
  lastDispatch.set(key, nowMs);
}

export function isDuplicateSend(key: string, nowMs: number = Date.now()): boolean {
  const at = lastDispatch.get(key);
  return at != null && nowMs - at < DEDUP_WINDOW_MS;
}

export function clearSendDispatched(key: string): void {
  lastDispatch.delete(key);
}

// Load persisted marks (dropping any already outside the window) into the in-memory
// map. Call BEFORE the check so a restart can't reopen the window.
export async function hydrateDedup(nowMs: number = Date.now()): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(DEDUP_STORE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, number>;
    for (const [k, ts] of Object.entries(obj)) {
      if (typeof ts === "number" && nowMs - ts < DEDUP_WINDOW_MS) lastDispatch.set(k, ts);
    }
  } catch {
    // corrupt/unavailable store → fall back to in-memory only.
  }
}

// Write the current (pruned) in-memory map to SecureStore. Call AFTER mark/clear.
export async function persistDedup(nowMs: number = Date.now()): Promise<void> {
  try {
    const obj: Record<string, number> = {};
    for (const [k, ts] of lastDispatch) {
      if (nowMs - ts < DEDUP_WINDOW_MS) obj[k] = ts;
    }
    await SecureStore.setItemAsync(DEDUP_STORE_KEY, JSON.stringify(obj));
  } catch {
    // best-effort; the in-memory guard still protects the live process.
  }
}
