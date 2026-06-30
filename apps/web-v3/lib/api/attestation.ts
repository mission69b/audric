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
const PHALA_VERIFY_URL =
  "https://cloud-api.phala.com/api/v1/attestations/verify";
// The attestation report endpoint. Phala-direct default; ⚠️ confirm the exact
// route empirically (the RedPill-fronted shape is api.redpill.ai/v1/attestation/report).
const ATTESTATION_BASE = "https://inference.phala.com";

// The ACI attestation report shape (`api_version: "aci/1"`) that
// inference.phala.com serves — RedPill/Phala's standard. Confirmed live
// 2026-06-30. The TDX quote is at `attestation.evidence.quote`; the channel
// binding for our upstream is the `tls_public_keys` entry for
// `inference.phala.com`; receipts are signed by `receipt_signing_keys`.
interface AciReport {
  api_version?: string;
  attestation?: {
    tee_type?: string;
    report_data?: string;
    evidence?: { quote?: string };
    workload_keyset?: {
      receipt_signing_keys?: { key_id?: string; public_key?: string }[];
      tls_public_keys?: { domain?: string; spki_sha256?: string }[];
    };
  };
  workload_id?: string;
}

export interface ConfidentialAttestation {
  attestedAtMs: number;
  model: string;
  reason?: string;
  /** The receipt-signing public key from the attested keyset (phase B/D). */
  signingKey?: string;
  tcbStatus?: string;
  /** SHA-256 of inference.phala.com's TLS SPKI — the channel binding (phase D). */
  tlsSpkiSha256?: string;
  verified: boolean;
  workloadId?: string;
}

const cache = new Map<string, ConfidentialAttestation>();

/**
 * True when fail-closed enforcement is on. **Enforced by DEFAULT** (secure with
 * zero config). The flag is a KILL-SWITCH: set
 * `CONFIDENTIAL_ATTESTATION_ENFORCE="false"` to fall back to observe-mode IF
 * Phala's external attestation / DCAP-verify services have an outage — so a
 * third-party verifier blip can't take down the whole confidential tier.
 * (Verified results cache 10m, absorbing brief blips without the switch.)
 */
export function isAttestationEnforced(): boolean {
  return env.CONFIDENTIAL_ATTESTATION_ENFORCE !== "false";
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
  let report: AciReport;
  try {
    const res = await fetch(
      `${ATTESTATION_BASE}/v1/attestation/report?model=${encodeURIComponent(upstream)}&nonce=${nonce}`,
      { headers: { Authorization: `Bearer ${env.PHALA_API_KEY}` } }
    );
    if (!res.ok) {
      return failed(model, `attestation fetch ${res.status}`);
    }
    report = (await res.json()) as AciReport;
  } catch (e) {
    return failed(
      model,
      e instanceof Error ? e.message : "attestation fetch error"
    );
  }

  const att = report.attestation;
  const quote = att?.evidence?.quote;
  if (!quote) {
    return failed(model, "no attestation.evidence.quote in ACI report");
  }
  const keyset = att?.workload_keyset;
  const tlsSpkiSha256 = keyset?.tls_public_keys?.find(
    (k) => k.domain === "inference.phala.com"
  )?.spki_sha256;
  const signingKey = keyset?.receipt_signing_keys?.[0]?.public_key;

  // Verify the Intel TDX quote (genuine confidential hardware) via Phala's
  // hosted DCAP verifier. NOTE (honest scope): this proves a genuine TDX
  // enclave. The FULL trustless ACI checks — report_data committing our nonce +
  // keyset (anti-replay), keyset_endorsement, and TLS-SPKI channel-binding — are
  // the Phase-D client verifier (port RedPill's logic / dcap-qvl). Recorded in
  // the trust boundary (SPEC_CONFIDENTIAL_API §3).
  let verifyJson: { quote?: { verified?: boolean; tcb_status?: string } };
  try {
    const v = await fetch(PHALA_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hex: quote }),
    });
    if (!v.ok) {
      return failed(model, `quote verify ${v.status}`);
    }
    verifyJson = await v.json();
  } catch (e) {
    return failed(model, e instanceof Error ? e.message : "quote verify error");
  }
  if (!verifyJson.quote?.verified) {
    return failed(model, "TDX quote not verified (not a genuine enclave)");
  }

  return {
    verified: true,
    model,
    signingKey,
    tlsSpkiSha256,
    workloadId: report.workload_id,
    tcbStatus: verifyJson.quote.tcb_status,
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
