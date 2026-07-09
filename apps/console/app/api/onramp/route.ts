import { getCurrentUser } from "@audric/auth/server";
import {
  checkoutOnrampSession,
  createLinkAuthIntent,
  createOnrampSession,
  exchangeAndStoreToken,
  getKycStatus,
  onrampConfigured,
  readOauthToken,
} from "@/lib/onramp";

// POST /api/onramp — the onramp flow's one server surface (SPEC_ONRAMP,
// S.681). Actions: auth-intent · tokens · kyc-status · session · checkout.
// Every action requires the Passport session; the destination wallet is the
// session address, never client-supplied. One route, five small actions —
// deliberately not five files.
export const dynamic = "force-dynamic";

const MIN_USD = 2;
const MAX_USD = 10_000;

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  );
}

export async function POST(req: Request): Promise<Response> {
  if (!onrampConfigured()) {
    return Response.json(
      { error: "Card top-ups are not available right now." },
      { status: 503 }
    );
  }
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: {
    action?: string;
    email?: string;
    authIntentId?: string;
    cryptoCustomerId?: string;
    cryptoPaymentToken?: string;
    sourceAmountUsd?: number;
    sessionId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  switch (body.action) {
    case "auth-intent": {
      const email = String(body.email ?? "").trim();
      if (!email.includes("@")) {
        return Response.json(
          { error: "A valid email is required." },
          { status: 400 }
        );
      }
      const r = await createLinkAuthIntent(email);
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json(r);
    }

    case "tokens": {
      const authIntentId = String(body.authIntentId ?? "").trim();
      if (!authIntentId) {
        return Response.json(
          { error: "authIntentId is required." },
          { status: 400 }
        );
      }
      const r = await exchangeAndStoreToken(authIntentId);
      if (!r.ok) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    case "kyc-status": {
      const oauthToken = await readOauthToken();
      if (!oauthToken) {
        return Response.json(
          { error: "Authenticate with Link first." },
          { status: 401 }
        );
      }
      const customerId = String(body.cryptoCustomerId ?? "").trim();
      if (!customerId) {
        return Response.json(
          { error: "cryptoCustomerId is required." },
          { status: 400 }
        );
      }
      const r = await getKycStatus(oauthToken, customerId);
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json(r);
    }

    case "session": {
      const oauthToken = await readOauthToken();
      if (!oauthToken) {
        return Response.json(
          { error: "Authenticate with Link first." },
          { status: 401 }
        );
      }
      const amount = Number(body.sourceAmountUsd);
      if (!Number.isFinite(amount) || amount < MIN_USD || amount > MAX_USD) {
        return Response.json(
          { error: `Amount must be $${MIN_USD}–$${MAX_USD}.` },
          { status: 400 }
        );
      }
      const cryptoCustomerId = String(body.cryptoCustomerId ?? "").trim();
      const cryptoPaymentToken = String(body.cryptoPaymentToken ?? "").trim();
      if (!(cryptoCustomerId && cryptoPaymentToken)) {
        return Response.json(
          { error: "cryptoCustomerId and cryptoPaymentToken are required." },
          { status: 400 }
        );
      }
      const r = await createOnrampSession({
        oauthToken,
        cryptoCustomerId,
        cryptoPaymentToken,
        sourceAmountUsd: amount,
        // The one rule: funds land at the signed-in Passport. Period.
        walletAddress: session.user.id,
        customerIp: clientIp(req),
      });
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json({ id: r.id });
    }

    case "checkout": {
      const oauthToken = await readOauthToken();
      if (!oauthToken) {
        return Response.json(
          { error: "Authenticate with Link first." },
          { status: 401 }
        );
      }
      const sessionId = String(body.sessionId ?? "").trim();
      if (!sessionId) {
        return Response.json(
          { error: "sessionId is required." },
          { status: 400 }
        );
      }
      const r = await checkoutOnrampSession({
        oauthToken,
        sessionId,
        customerIp: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? "unknown",
      });
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json({ client_secret: r.clientSecret });
    }

    default:
      return Response.json(
        {
          error:
            "action must be auth-intent | tokens | kyc-status | session | checkout.",
        },
        { status: 400 }
      );
  }
}
