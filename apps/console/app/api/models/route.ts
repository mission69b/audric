// Proxy the public api.t2000.ai/v1/models catalog (same-origin for the client,
// avoiding CORS) with a short cache. Display-only — no auth needed.
export async function GET() {
  try {
    const res = await fetch("https://api.t2000.ai/v1/models", {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return Response.json({ data: [] });
    }
    const j = await res.json();
    return Response.json({ data: j.data ?? [] });
  } catch {
    return Response.json({ data: [] });
  }
}
