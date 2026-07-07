// One-retry fetch for server-side reads against api.t2000.ai / the gateway.
// Vercel logs show sporadic ECONNRESET / ETIMEDOUT / "other side closed"
// (stale keep-alive sockets between the lambda and the upstream) — the
// request itself is fine on a fresh socket, so a single immediate retry
// absorbs nearly all of them. Network errors only; HTTP errors pass through.
export async function fetchRetry(
  url: string,
  init?: RequestInit & { next?: { revalidate?: number } }
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    return await fetch(url, init);
  }
}
