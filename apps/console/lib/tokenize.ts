import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { fromBase64 } from "@mysten/sui/utils";

// Client half of tokenize-your-agent (SPEC_ACP_SUI §6). TWO Passport taps,
// both UNSPONSORED (the launcher's SUI pays gas AND seeds the pool — t2000
// never fronts either):
//   1. publish — the agent's coin package (supply → launcher, caps frozen,
//      package immutable)
//   2. tokenize — bind + 50/50 split + Cetus pool + 10-year LP lock +
//      registry finalize, atomically
// Server prepares bytes / executes; the session key signs; auth is re-checked
// on-chain (agent-or-confirmed-owner) regardless of what the client sends.

export type TokenizeStep = "publish" | "tokenize";

export const TOKENIZE_STEPS: { id: TokenizeStep; label: string }[] = [
  { id: "publish", label: "Publishing your coin (supply fixed, caps frozen)" },
  { id: "tokenize", label: "Creating the pool + locking LP for 10 years" },
];

export type TokenParams = {
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
  /** SUI (in MIST) the launcher seeds the pool with. */
  lpSuiMist: bigint;
};

export type TokenizeResult = {
  publishDigest: string;
  tokenizeDigest: string;
  coinType: string;
  poolId?: string;
  lockId?: string;
};

function errMsg(error: unknown, fallback: string): string {
  if (typeof error === "string") {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

async function postJson(
  url: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: unknown;
  } & Record<string, unknown>;
  if (!res.ok) {
    throw new Error(errMsg(json.error, `HTTP ${res.status}`));
  }
  return json;
}

export async function tokenizeAgent(opts: {
  agent: string;
  params: TokenParams;
  onStep?: (step: TokenizeStep) => void;
}): Promise<TokenizeResult> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again first.");
  }
  const signer = toZkLoginSigner(session);

  // Tap 1 — publish the coin package.
  opts.onStep?.("publish");
  const prep1 = await postJson("/api/capital/launch-prepare", {
    symbol: opts.params.symbol,
    name: opts.params.name,
    description: opts.params.description,
    iconUrl: opts.params.iconUrl,
  });
  const sig1 = await signer.signTransaction(
    fromBase64(String(prep1.txBytes ?? ""))
  );
  const pub = await postJson("/api/capital/launch-submit", {
    txBytes: prep1.txBytes,
    signature: sig1.signature,
  });

  // Tap 2 — bind + pool + lock + finalize.
  opts.onStep?.("tokenize");
  const prep2 = await postJson("/api/capital/tokenize-prepare", {
    agent: opts.agent,
    coinType: pub.coinType,
    supplyCoinId: pub.supplyCoinId,
    coinMetadataId: pub.coinMetadataId,
    lpSuiMist: opts.params.lpSuiMist.toString(),
    poolUrl: opts.params.iconUrl,
  });
  const sig2 = await signer.signTransaction(
    fromBase64(String(prep2.txBytes ?? ""))
  );
  const fin = await postJson("/api/capital/tokenize-submit", {
    txBytes: prep2.txBytes,
    signature: sig2.signature,
  });

  return {
    publishDigest: String(pub.digest ?? ""),
    tokenizeDigest: String(fin.digest ?? ""),
    coinType: String(pub.coinType ?? ""),
    poolId: fin.poolId ? String(fin.poolId) : undefined,
    lockId: fin.lockId ? String(fin.lockId) : undefined,
  };
}
