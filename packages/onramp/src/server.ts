import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

/**
 * Stripe fiat→USDC onramp — shared server half (SPEC_ONRAMP, S.681/S.684).
 *
 * One implementation for BOTH apps (console + audric web-v3): wraps the
 * Embedded Components preview APIs (Link OAuth + crypto onramp). Apps inject
 * their validated env via `OnrampConfig` — this package never reads
 * process.env (each app's env gate stays the gate).
 *
 * The destination is ALWAYS the signed-in Passport address, enforced
 * server-side at session-create. The Link OAuth access token is short-lived
 * flow state: sealed into an HS256 JWT (the app's AUTH_SECRET) in an
 * httpOnly cookie — never exposed to the client, no DB row needed.
 */

const STRIPE_VERSION = "2026-05-27.preview;crypto_onramp_beta=v2";
const OAUTH_SCOPES = "kyc.status:read,crypto:ramp";
const TOKEN_COOKIE = "onramp_token";
const TOKEN_TTL_S = 30 * 60;

export type OnrampConfig = {
  stripeSecretKey: string;
  oauthClientId: string;
  /** HS256 secret for sealing the flow cookie (the app's AUTH_SECRET). */
  authSecret: string;
};

export type OnrampEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_ONRAMP_CLIENT_ID?: string;
  STRIPE_ONRAMP_CLIENT_SECRET?: string;
  AUTH_SECRET: string;
};

/** True when every credential the flow needs is present. */
export function onrampConfigured(env: OnrampEnv): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_ONRAMP_CLIENT_ID &&
      env.STRIPE_ONRAMP_CLIENT_SECRET
  );
}

/** Build the config from an app's validated env (throws if incomplete). */
export function onrampConfig(env: OnrampEnv): OnrampConfig {
  if (!onrampConfigured(env)) {
    throw new Error("Onramp is not configured.");
  }
  return {
    stripeSecretKey: env.STRIPE_SECRET_KEY as string,
    oauthClientId: env.STRIPE_ONRAMP_CLIENT_ID as string,
    authSecret: env.AUTH_SECRET,
  };
}

// ── Link OAuth ───────────────────────────────────────────────────────────────

/** Create a LinkAuthIntent for an email. Returns the intent id, or
 *  `noAccount: true` when the email has no Link account (guide: 404). */
export async function createLinkAuthIntent(
  cfg: OnrampConfig,
  email: string
): Promise<{ authIntentId?: string; noAccount?: boolean; error?: string }> {
  const res = await fetch("https://login.link.com/v1/link_auth_intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.stripeSecretKey}`,
    },
    body: JSON.stringify({
      email,
      oauth_scopes: OAUTH_SCOPES,
      oauth_client_id: cfg.oauthClientId,
    }),
  });
  if (res.status === 404) {
    return { noAccount: true };
  }
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!(res.ok && data.id)) {
    return { error: data.error?.message ?? `Link auth failed (${res.status})` };
  }
  return { authIntentId: data.id };
}

/** Exchange a completed LinkAuthIntent for an access token and seal it into
 *  the flow cookie. */
export async function exchangeAndStoreToken(
  cfg: OnrampConfig,
  authIntentId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `https://login.link.com/v1/link_auth_intent/${encodeURIComponent(authIntentId)}/tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.stripeSecretKey}` },
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: { message?: string };
  };
  if (!(res.ok && data.access_token)) {
    return {
      ok: false,
      error: data.error?.message ?? `Token exchange failed (${res.status})`,
    };
  }
  const sealed = await new SignJWT({ t: data.access_token })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${TOKEN_TTL_S}s`)
    .sign(new TextEncoder().encode(cfg.authSecret));
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, sealed, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: TOKEN_TTL_S,
    path: "/",
  });
  return { ok: true };
}

/** Read the sealed OAuth token back out of the flow cookie. */
export async function readOauthToken(
  cfg: OnrampConfig
): Promise<string | null> {
  const jar = await cookies();
  const sealed = jar.get(TOKEN_COOKIE)?.value;
  if (!sealed) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(
      sealed,
      new TextEncoder().encode(cfg.authSecret)
    );
    return typeof payload.t === "string" ? payload.t : null;
  } catch {
    return null;
  }
}

// ── Onramp APIs (all carry the OAuth token) ─────────────────────────────────

function stripeHeaders(
  cfg: OnrampConfig,
  oauthToken: string
): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.stripeSecretKey}`,
    "Stripe-OAuth-Token": oauthToken,
    "Stripe-Version": STRIPE_VERSION,
  };
}

/** KYC status for a crypto customer (guide: verifications array). */
export async function getKycStatus(
  cfg: OnrampConfig,
  oauthToken: string,
  customerId: string
): Promise<{
  kycStatus: string;
  idDocStatus: string;
  error?: string;
}> {
  const res = await fetch(
    `https://api.stripe.com/v1/crypto/customers/${encodeURIComponent(customerId)}`,
    { headers: stripeHeaders(cfg, oauthToken) }
  );
  const customer = (await res.json().catch(() => ({}))) as {
    verifications?: { name?: string; status?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return {
      kycStatus: "unknown",
      idDocStatus: "unknown",
      error: customer.error?.message ?? `KYC check failed (${res.status})`,
    };
  }
  const verifications = customer.verifications ?? [];
  return {
    kycStatus:
      verifications.find((v) => v.name === "kyc_verified")?.status ??
      "not_started",
    idDocStatus:
      verifications.find((v) => v.name === "id_document_verified")?.status ??
      "not_started",
  };
}

/** Create the onramp session. Destination is pinned server-side: the
 *  Passport address, USDC on Sui. */
export async function createOnrampSession(
  cfg: OnrampConfig,
  opts: {
    oauthToken: string;
    cryptoCustomerId: string;
    cryptoPaymentToken: string;
    sourceAmountUsd: number;
    walletAddress: string;
    customerIp: string;
  }
): Promise<{ id?: string; error?: string }> {
  const params = new URLSearchParams({
    ui_mode: "headless",
    crypto_customer_id: opts.cryptoCustomerId,
    payment_token: opts.cryptoPaymentToken,
    source_amount: String(opts.sourceAmountUsd),
    source_currency: "usd",
    destination_currency: "usdc",
    "destination_currencies[]": "usdc",
    destination_network: "sui",
    "destination_networks[]": "sui",
    wallet_address: opts.walletAddress,
    customer_ip_address: opts.customerIp,
  });
  const res = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
    method: "POST",
    headers: {
      ...stripeHeaders(cfg, opts.oauthToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!(res.ok && data.id)) {
    console.error(
      "[onramp] session create failed",
      res.status,
      JSON.stringify(data.error ?? data).slice(0, 500)
    );
    return {
      error: data.error?.message ?? `Session create failed (${res.status})`,
    };
  }
  console.log("[onramp] session created", data.id);
  return { id: data.id };
}

/** The checkout leg — ONLY ever called from the performCheckout callback
 *  (the SDK drives 3DS between calls; the guide is explicit about this). */
export async function checkoutOnrampSession(
  cfg: OnrampConfig,
  opts: {
    oauthToken: string;
    sessionId: string;
    customerIp: string;
    userAgent: string;
  }
): Promise<{ clientSecret?: string; error?: string }> {
  const res = await fetch(
    `https://api.stripe.com/v1/crypto/onramp_sessions/${encodeURIComponent(opts.sessionId)}/checkout`,
    {
      method: "POST",
      headers: {
        ...stripeHeaders(cfg, opts.oauthToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // ACH mandate data — harmless for card flows, required for ACH.
      body: new URLSearchParams({
        "mandate_data[customer_acceptance][type]": "online",
        "mandate_data[customer_acceptance][accepted_at]": String(
          Math.floor(Date.now() / 1000)
        ),
        "mandate_data[customer_acceptance][online][ip_address]":
          opts.customerIp,
        "mandate_data[customer_acceptance][online][user_agent]": opts.userAgent,
      }),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    client_secret?: string;
    error?: { message?: string };
  };
  if (!(res.ok && data.client_secret)) {
    console.error(
      "[onramp] checkout leg failed",
      res.status,
      JSON.stringify(data.error ?? data).slice(0, 500)
    );
    return {
      error: data.error?.message ?? `Checkout failed (${res.status})`,
    };
  }
  console.log("[onramp] checkout client_secret issued for", opts.sessionId);
  return { clientSecret: data.client_secret };
}

/** Create a HOSTED onramp session (Stripe's crypto.link.com page — no Link
 *  OAuth, no embedded frames; the reliable path while the embedded preview
 *  SDK misresolves its chunk URLs, S.685). Destination pinned server-side. */
export async function createHostedOnrampSession(
  cfg: OnrampConfig,
  opts: { walletAddress: string; finishUrl?: string }
): Promise<{ redirectUrl?: string; error?: string }> {
  const params = new URLSearchParams({
    "wallet_addresses[sui]": opts.walletAddress,
    "destination_currencies[]": "usdc",
    "destination_networks[]": "sui",
    destination_currency: "usdc",
    destination_network: "sui",
  });
  if (opts.finishUrl) {
    params.set("finish_url", opts.finishUrl);
  }
  const res = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = (await res.json().catch(() => ({}))) as {
    redirect_url?: string;
    error?: { message?: string };
  };
  if (!(res.ok && data.redirect_url)) {
    console.error(
      "[onramp] hosted session failed",
      res.status,
      JSON.stringify(data.error ?? data).slice(0, 500)
    );
    return {
      error: data.error?.message ?? `Session create failed (${res.status})`,
    };
  }
  return { redirectUrl: data.redirect_url };
}

// ── The one route handler (both apps mount this) ────────────────────────────

const MIN_USD = 2;
const MAX_USD = 10_000;

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  );
}

/**
 * POST handler for /api/onramp — the flow's one server surface. Actions:
 * auth-intent · tokens · kyc-status · session · checkout. The caller
 * resolves its own session and passes the Passport address; unset env →
 * pass `null` config to get the 503.
 */
export async function handleOnrampPost(
  req: Request,
  cfg: OnrampConfig | null,
  passportAddress: string | null
): Promise<Response> {
  if (!cfg) {
    return Response.json(
      { error: "Card top-ups are not available right now." },
      { status: 503 }
    );
  }
  if (!passportAddress) {
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
    case "hosted-session": {
      // finish_url must stay same-origin (open-redirect guard).
      const referer = req.headers.get("referer");
      const origin = req.headers.get("origin") ?? new URL(req.url).origin;
      const finishUrl =
        referer && new URL(referer).origin === origin ? referer : undefined;
      const r = await createHostedOnrampSession(cfg, {
        walletAddress: passportAddress,
        finishUrl,
      });
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json({ redirect_url: r.redirectUrl });
    }

    case "auth-intent": {
      const email = String(body.email ?? "").trim();
      if (!email.includes("@")) {
        return Response.json(
          { error: "A valid email is required." },
          { status: 400 }
        );
      }
      const r = await createLinkAuthIntent(cfg, email);
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
      const r = await exchangeAndStoreToken(cfg, authIntentId);
      if (!r.ok) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    case "kyc-status": {
      const oauthToken = await readOauthToken(cfg);
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
      const r = await getKycStatus(cfg, oauthToken, customerId);
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json(r);
    }

    case "session": {
      const oauthToken = await readOauthToken(cfg);
      if (!oauthToken) {
        return Response.json(
          { error: "Authenticate with Link first." },
          { status: 401 }
        );
      }
      const amount = Number(body.sourceAmountUsd);
      if (
        !(Number.isFinite(amount) && amount >= MIN_USD && amount <= MAX_USD)
      ) {
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
      const r = await createOnrampSession(cfg, {
        oauthToken,
        cryptoCustomerId,
        cryptoPaymentToken,
        sourceAmountUsd: amount,
        // The one rule: funds land at the signed-in Passport. Period.
        walletAddress: passportAddress,
        customerIp: clientIp(req),
      });
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json({ id: r.id });
    }

    case "checkout": {
      const oauthToken = await readOauthToken(cfg);
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
      const r = await checkoutOnrampSession(cfg, {
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
