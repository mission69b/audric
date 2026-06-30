import "server-only";

import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Confidential-upstream attestation verification — SPEC_CONFIDENTIAL_API v3.0,
 * Phase A. Before serving a `phala/*` (confidential) model, prove a genuine,
 * freshly-attested Phala GPU-TEE backs it; fail-closed otherwise.
 *
 * Flow (Phala / RedPill confidential-AI attestation):
 *   1. GET {ATTESTATION_BASE}/v1/attestation/report?model=<upstream>&nonce=<64hex>
 *      → { intel_quote, signing_address, … } (flat) OR a two-layer
 *        { gateway_attestation, model_attestations } (Phala/NearAI).
 *   2. Verify the Intel TDX quote (server-side: Phala's hosted DCAP verifier —
 *      a pragmatic fail-closed gate; the trustless `dcap-qvl` local check is the
 *      Phase-D client verifier `t2 verify`).
 *   3. Freshness: the verified quote's report_data must commit our nonce.
 *
 * Result is CACHED per model (a workload's attestation is stable) with a TTL —
 * we re-attest periodically, NOT per inference (RedPill's model).
 *
 * ⚠️ ROLLOUT — fail-closed is gated behind `CONFIDENTIAL_ATTESTATION_ENFORCE`
 * (default OFF = observe-mode: verify + log, still serve). This is deliberate:
 * the exact `inference.phala.com` attestation route + response shape must be
 * confirmed against a REAL response (founder curl + observe-mode logs) before
 * we let a verification miss block the live v1.5 confidential tier. Flip the
 * flag ON only after observe-mode shows clean `verified: true`.
 */

// Re-attest at most every 10 min per model (attestation is workload-stable).
const ATTESTATION_TTL_MS = 10 * 60 * 1000;
// Cache FAILURES briefly too — so observe-mode (and an unconfirmed route)
// doesn't fire a failed attestation round-trip per confidential request; retry
// at most once/min per model.
const FAILED_TTL_MS = 60 * 1000;
// Phala's hosted DCAP verifier (server-side gate). Trustless local verification
// (dcap-qvl, chains to Intel PCS) is the Phase-D client verifier.
const PHALA_VERIFY_URL = "https://cloud-api.phala.com/api/v1/attestations/verify";
// The attestation report endpoint. Phala-direct default; ⚠️ confirm the exact
// route empirically (the RedPill-fronted shape is api.redpill.ai/v1/attestation/report).
const ATTESTATION_BASE = "https://inference.phala.com";

export interface ConfidentialAttestation {
  verified: boolean;
  model: string;
  signingAddress?: string;
  tcbStatus?: string;
  reason?: string;
  attestedAtMs: number;
}

const cache = new Map<string, ConfidentialAttestation>();

/** True when fail-closed enforcement is on (else observe-only). */
export function isAttestationEnforced(): boolean {
  return env.CONFIDENTIAL_ATTESTATION_ENFORCE === "true";
}

function failed(model: string, reason: string): ConfidentialAttestation {
  return { verified: false, model, reason, attestedAtMs: Date.now() };
}

async function fetchAndVerify(
  model: string,
  upstream: string
): Promise<ConfidentialAttestation> {
  if (!env.PHALA_API_KEY) {
    return failed(model, "confidential backend not configured");
  }
  const nonce = randomBytes(32).toString("hex");
  let report: Record<string, unknown>;
  try {
    const res = await fetch(
      `${ATTESTATION_BASE}/v1/attestation/report?model=${encodeURIComponent(upstream)}&nonce=${nonce}`,
      { headers: { Authorization: `Bearer ${env.PHALA_API_KEY}` } }
    );
    if (!res.ok) {
      return failed(model, `attestation fetch ${res.status}`);
    }
    report = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    return failed(model, e instanceof Error ? e.message : "attestation fetch error");
  }

  // Flatten flat OR two-layer (Phala/NearAI). Prefer the MODEL attestation (the
  // inference runtime); the gateway attestation protects routing only.
  const layer =
    (report.model_attestations as Record<string, unknown>[] | undefined)?.[0] ??
    (report.gateway_attestation as Record<string, unknown> | undefined) ??
    report;
  const quoteHex = layer.intel_quote as string | undefined;
  const signingAddress = layer.signing_address as string | undefined;
  if (!quoteHex) {
    return failed(model, "no intel_quote in attestation report");
  }

  // Verify the TDX quote (genuine Intel TDX hardware).
  let verifyJson: { quote?: { verified?: boolean; reportdata?: string; tcb_status?: string; body?: { reportdata?: string } } };
  try {
    const v = await fetch(PHALA_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hex: quoteHex }),
    });
    if (!v.ok) {
      return failed(model, `quote verify ${v.status}`);
    }
    verifyJson = await v.json();
  } catch (e) {
    return failed(model, e instanceof Error ? e.message : "quote verify error");
  }
  const quote = verifyJson.quote;
  if (!quote?.verified) {
    return failed(model, "TDX quote not verified (not a genuine enclave)");
  }

  // Freshness: the verified quote's report_data must commit the nonce we sent
  // (anti-replay). report_data layout binds the signing key + nonce.
  const reportData = (quote.reportdata ?? quote.body?.reportdata ?? "").toLowerCase();
  if (!reportData.includes(nonce.toLowerCase())) {
    return failed(model, "nonce not bound in report_data (stale/replayed quote)");
  }

  return {
    verified: true,
    model,
    signingAddress,
    tcbStatus: quote.tcb_status,
    attestedAtMs: Date.now(),
  };
}

/**
 * Verify (with cache) that a genuine, freshly-attested Phala enclave backs
 * `model` (upstream slug `upstream`). Cached per model — verified for
 * ATTESTATION_TTL_MS, failed for the shorter FAILED_TTL_MS (so a transient
 * failure / unconfirmed route retries soon without hammering per request).
 */
export async function verifyConfidentialUpstream(
  model: string,
  upstream: string
): Promise<ConfidentialAttestation> {
  const cached = cache.get(model);
  if (cached) {
    const ttl = cached.verified ? ATTESTATION_TTL_MS : FAILED_TTL_MS;
    if (Date.now() - cached.attestedAtMs < ttl) {
      return cached;
    }
  }
  const fresh = await fetchAndVerify(model, upstream);
  cache.set(model, fresh);
  return fresh;
}
