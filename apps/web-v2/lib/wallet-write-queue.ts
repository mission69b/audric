// ---------------------------------------------------------------------------
// Per-wallet client-side write serializer.
//
// Sui owned-object transactions from the same sender MUST NOT run
// concurrently: two txs that spend the same coin/gas object at once get one
// accepted and the other rejected by validators as equivocation
// ("... already locked by a different transaction"), which can also leave the
// loser's payment proof unverifiable.
//
// The engine serializes its SERVER-executed writes via a mutex. The
// client-delegated write path (mpp_call gasless pay, send) had no equivalent:
// the model can emit N writes in one step and the user can approve them
// near-simultaneously, so both pay loops grabbed the same USDC coin and
// equivocated. This queue gives the client path the same one-at-a-time
// guarantee.
//
// A single global chain is sufficient: one browser tab == one signed-in
// wallet. Failures are isolated — a rejected write does not poison the chain
// for the next one.
// ---------------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve();

/**
 * Run `fn` after every previously enqueued wallet write has settled. Returns
 * the result (or rejection) of `fn` to the caller; the internal chain swallows
 * outcomes so one failure never blocks the next write.
 */
export function enqueueWalletWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
