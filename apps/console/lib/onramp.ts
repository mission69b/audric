import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Stripe fiat→USDC onramp — server half (SPEC_ONRAMP, S.681).
 *
 * Wraps the Embedded Components preview APIs (Link OAuth + crypto onramp).
 * The destination is ALWAYS the signed-in Passport address, enforced
 * server-side at session-create — the console is the funding hub; agents get
 * funded from the Passport with instant gasless sends (Fund agent).
 *
 * The Link OAuth access token is short-lived flow state: sealed into an
 * HS256 JWT (the existing AUTH_SECRET) in an httpOnly cookie — never exposed
 * to the client, no DB row needed.
 */

const STRIPE_VERSION = "2026-05-27.preview;crypto_onramp_beta=v2";
const OAUTH_SCOPES = "kyc.status:read,crypto:ramp";
const TOKEN_COOKIE = "onramp_token";
const TOKEN_TTL_S = 30 * 60;

export function onrampConfigured(): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_ONRAMP_CLIENT_ID &&
      env.STRIPE_ONRAMP_CLIENT_SECRET
  );
}

function secretKey(): string {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Onramp is not configured.");
  }
  return key;
}

// ── Link OAuth ───────────────────────────────────────────────────────────────

/** Create a LinkAuthIntent for an email. Returns the intent id, or
 *  `noAccount: true` when the email has no Link account (guide: 404). */
export async function createLinkAuthIntent(
  email: string
): Promise<{ authIntentId?: string; noAccount?: boolean; error?: string }> {
  const res = await fetch("https://login.link.com/v1/link_auth_intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretKey()}`,
    },
    body: JSON.stringify({
      email,
      oauth_scopes: OAUTH_SCOPES,
      oauth_client_id: env.STRIPE_ONRAMP_CLIENT_ID,
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
  authIntentId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `https://login.link.com/v1/link_auth_intent/${encodeURIComponent(authIntentId)}/tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey()}` },
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
    .sign(new TextEncoder().encode(env.AUTH_SECRET));
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
export async function readOauthToken(): Promise<string | null> {
  const jar = await cookies();
  const sealed = jar.get(TOKEN_COOKIE)?.value;
  if (!sealed) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(
      sealed,
      new TextEncoder().encode(env.AUTH_SECRET)
    );
    return typeof payload.t === "string" ? payload.t : null;
  } catch {
    return null;
  }
}

// ── Onramp APIs (all carry the OAuth token) ─────────────────────────────────

function stripeHeaders(oauthToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey()}`,
    "Stripe-OAuth-Token": oauthToken,
    "Stripe-Version": STRIPE_VERSION,
  };
}

/** KYC status for a crypto customer (guide: verifications array). */
export async function getKycStatus(
  oauthToken: string,
  customerId: string
): Promise<{
  kycStatus: string;
  idDocStatus: string;
  error?: string;
}> {
  const res = await fetch(
    `https://api.stripe.com/v1/crypto/customers/${encodeURIComponent(customerId)}`,
    { headers: stripeHeaders(oauthToken) }
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
export async function createOnrampSession(opts: {
  oauthToken: string;
  cryptoCustomerId: string;
  cryptoPaymentToken: string;
  sourceAmountUsd: number;
  walletAddress: string;
  customerIp: string;
}): Promise<{ id?: string; error?: string }> {
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
      ...stripeHeaders(opts.oauthToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!(res.ok && data.id)) {
    return {
      error: data.error?.message ?? `Session create failed (${res.status})`,
    };
  }
  return { id: data.id };
}

/** The checkout leg — ONLY ever called from the performCheckout callback
 *  (the SDK drives 3DS between calls; the guide is explicit about this). */
export async function checkoutOnrampSession(opts: {
  oauthToken: string;
  sessionId: string;
  customerIp: string;
  userAgent: string;
}): Promise<{ clientSecret?: string; error?: string }> {
  const res = await fetch(
    `https://api.stripe.com/v1/crypto/onramp_sessions/${encodeURIComponent(opts.sessionId)}/checkout`,
    {
      method: "POST",
      headers: {
        ...stripeHeaders(opts.oauthToken),
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
    return {
      error: data.error?.message ?? `Checkout failed (${res.status})`,
    };
  }
  return { clientSecret: data.client_secret };
}
