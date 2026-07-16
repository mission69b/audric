/**
 * Stripe fiat→USDC onramp — shared server half (SPEC_ONRAMP, S.681/S.687).
 *
 * One implementation for BOTH apps (console + audric web-v3), built on the
 * EMBEDDED ONRAMP WIDGET (public preview): the server mints an
 * `/v1/crypto/onramp_sessions` session with the destination pinned, and
 * Stripe renders the entire flow (email, OTP, KYC, card, 3DS) inside the
 * widget iframe the client mounts. The headless Embedded Components
 * integration (Link OAuth + custom UI state machine, S.681–S.686) was
 * replaced wholesale in S.687 — five debug rounds proved it too fragile.
 *
 * Apps inject their validated env via `OnrampConfig` — this package never
 * reads process.env (each app's env gate stays the gate). The destination is
 * ALWAYS the signed-in Passport address, enforced server-side and locked
 * (`lock_wallet_address`) so the widget can't change it.
 */

export type OnrampConfig = {
  stripeSecretKey: string;
};

export type OnrampEnv = {
  STRIPE_SECRET_KEY?: string;
};

/** True when the credential the flow needs is present. */
export function onrampConfigured(env: OnrampEnv): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/** Build the config from an app's validated env (throws if incomplete). */
export function onrampConfig(env: OnrampEnv): OnrampConfig {
  if (!onrampConfigured(env)) {
    throw new Error("Onramp is not configured.");
  }
  return { stripeSecretKey: env.STRIPE_SECRET_KEY as string };
}

const GEO_UNSUPPORTED_CODES = new Set([
  "crypto_onramp_unsupported_country",
  "crypto_onramp_unsupportable_customer",
]);

/** Mint an onramp session pinned to the Passport: USDC on Sui, wallet
 *  locked. Returns the widget `client_secret` AND the hosted-page
 *  `redirect_url` (same session works for both surfaces). Passing the
 *  visitor's IP lets Stripe geo-check up front — an unsupported country
 *  (their onramp covers US + EU) comes back as `unsupported: true` so the
 *  UI can show a useful fallback instead of Stripe's error banner. */
export async function createOnrampSession(
  cfg: OnrampConfig,
  opts: {
    walletAddress: string;
    email?: string;
    finishUrl?: string;
    customerIp?: string;
  }
): Promise<{
  clientSecret?: string;
  redirectUrl?: string;
  unsupported?: boolean;
  error?: string;
}> {
  // NB: the address MUST go through the singular `wallet_address` param.
  // `wallet_addresses[sui]` is validated by Stripe but silently NOT persisted
  // (sui-specific — ethereum/solana persist fine), leaving the session locked
  // with no destination → the widget dies with "An unknown error occurred".
  const params = new URLSearchParams({
    wallet_address: opts.walletAddress,
    lock_wallet_address: "true",
    "destination_currencies[]": "usdc",
    "destination_networks[]": "sui",
    destination_currency: "usdc",
    destination_network: "sui",
  });
  if (opts.email) {
    params.set("customer_information[email]", opts.email);
  }
  if (opts.finishUrl) {
    params.set("finish_url", opts.finishUrl);
  }
  if (opts.customerIp) {
    params.set("customer_ip_address", opts.customerIp);
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
    id?: string;
    client_secret?: string;
    redirect_url?: string;
    error?: { code?: string; message?: string };
  };
  if (!(res.ok && data.client_secret)) {
    if (data.error?.code && GEO_UNSUPPORTED_CODES.has(data.error.code)) {
      return { unsupported: true };
    }
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
  return { clientSecret: data.client_secret, redirectUrl: data.redirect_url };
}

// ── The one route handler (both apps mount this) ────────────────────────────

/** The visitor's IP, only when it's a real public address — private/loopback
 *  values (local dev) would make Stripe reject the param as malformed. */
function publicClientIp(req: Request): string | undefined {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) {
    return;
  }
  const isPrivate =
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("fe80:") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd");
  return isPrivate ? undefined : ip;
}

/**
 * POST handler for /api/onramp. Actions:
 * - `widget-session` → `{ client_secret }` for mounting the embedded widget
 * - `hosted-session` → `{ redirect_url }` for Stripe's hosted page (fallback)
 * The caller resolves its own session and passes the Passport address;
 * unset env → pass `null` config to get the 503.
 */
export async function handleOnrampPost(
  req: Request,
  cfg: OnrampConfig | null,
  passportAddress: string | null,
  sessionEmail?: string | null
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

  let body: { action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  switch (body.action) {
    case "widget-session": {
      const r = await createOnrampSession(cfg, {
        walletAddress: passportAddress,
        email: sessionEmail ?? undefined,
        customerIp: publicClientIp(req),
      });
      if (r.unsupported) {
        return Response.json({ unsupported: true });
      }
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json({ client_secret: r.clientSecret });
    }

    case "hosted-session": {
      // finish_url must stay same-origin (open-redirect guard).
      const referer = req.headers.get("referer");
      const origin = req.headers.get("origin") ?? new URL(req.url).origin;
      const finishUrl =
        referer && new URL(referer).origin === origin ? referer : undefined;
      const r = await createOnrampSession(cfg, {
        walletAddress: passportAddress,
        email: sessionEmail ?? undefined,
        finishUrl,
        customerIp: publicClientIp(req),
      });
      if (r.unsupported) {
        return Response.json({ unsupported: true });
      }
      if (r.error) {
        return Response.json({ error: r.error }, { status: 502 });
      }
      return Response.json({ redirect_url: r.redirectUrl });
    }

    default:
      return Response.json(
        { error: "action must be widget-session | hosted-session." },
        { status: 400 }
      );
  }
}
