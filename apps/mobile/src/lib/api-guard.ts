// Phase-0 production gate — the runtime enforcement of the "⚠️ DEV TRUST MODEL"
// comments on the API routes. Those routes trust a CLIENT-ASSERTED identity (`userId`
// in the body / query) and the chat route is an UNAUTHENTICATED provider-key proxy —
// acceptable ONLY on localhost / the dev tunnel. This turns that boundary from a
// comment into code: in a production build every gated route hard-refuses, so the
// trust model can never be shipped by accident (the security review's "must not
// survive the first non-local deploy").
//
// LIFTING THIS: it comes off ONLY together with real auth. When the `audric_session`
// httpOnly cookie is verified server-side and each route derives identity from it
// (never from the client), replace this gate with that check — do NOT add an env
// escape hatch, which would let the trust model ship without the auth it presumes.

export function productionGate(): Response | null {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      {
        error:
          "This route is disabled in production until session authentication (audric_session) is wired.",
      },
      { status: 403 }
    );
  }
  return null;
}
