/**
 * Defense-in-depth sanitizer for stream error messages.
 *
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.3 / S.198 — 2026-05-20]
 *
 * Ported from `apps/web/lib/engine/stream-errors.ts`. The t2000
 * engine's LLM provider already converts known provider errors
 * (overloaded, rate-limited, network) into clean user-facing strings
 * via `friendlyErrorMessage` before throwing. This module exists so
 * the chat route has a final gatekeeper: if any other layer ever leaks
 * a raw Anthropic JSON payload or other technical message into
 * `err.message`, we map it here so the chat UI never renders raw JSON
 * to the user.
 *
 * Always log the RAW message server-side for debugging (callers should
 * do this — see `route.ts` `console.error(...)` calls); only emit the
 * SANITIZED message on the wire.
 *
 * [SPEC_AI_SDK_HARDENING P6.3 — 2026-05-24] Layered classification:
 *   1. AI SDK typed-class checks first (`isInstance` predicates) —
 *      stable contract, survives vendor wording changes.
 *   2. String-heuristic fallback for raw strings / engine error chunks
 *      that don't carry typed-class metadata (engine emits friendly
 *      strings, not typed instances, via `friendlyErrorMessage`).
 *
 * Why layered (not type-only): the engine's error chunks reach
 * `translateChunk` as plain `Error` instances with friendly-stringified
 * messages already — those have no `APICallError.isInstance(err)`
 * provenance to read from. The heuristic stays as the catch-all.
 */

import {
  APICallError,
  InvalidToolApprovalError,
  InvalidToolInputError,
  NoSuchToolError,
  RetryError,
  ToolCallNotFoundForApprovalError,
} from "ai";

/**
 * Stable identifiers for classified errors. Used for telemetry +
 * downstream UX decisions (banner copy, retry affordances).
 */
export type StreamErrorClassification =
  | "api-rate-limit"
  | "api-server-error"
  | "api-auth"
  | "api-bad-request"
  | "api-network"
  | "api-call-error"
  | "retry-exhausted"
  | "no-such-tool"
  | "invalid-tool-input"
  | "invalid-tool-approval"
  | "tool-call-not-found"
  | "provider-overloaded"
  | "provider-rate-limit"
  | "provider-network"
  | "provider-payload"
  | "database"
  | "unknown";

export interface ClassifiedStreamError {
  classification: StreamErrorClassification;
  message: string;
}

/**
 * Type guard for AI SDK `ToolExecutionError`. The class itself isn't
 * exported as a public top-level binding in the version we depend on,
 * but instances carry a structural marker — they're `Error` subclasses
 * with a `cause` field set to the tool's underlying throw. We never
 * unwrap them speculatively; the marker is here only so future agents
 * can extend this module if AI SDK starts exporting it.
 */
function isToolExecutionErrorLike(error: unknown): error is Error & {
  cause?: unknown;
} {
  return (
    error instanceof Error &&
    error.name === "AI_ToolExecutionError" &&
    "cause" in error
  );
}

/**
 * Primary entry point — classify an arbitrary error value into a
 * user-safe message + a stable classification tag.
 *
 * Layered:
 *   1. AI SDK typed-class checks (stable, survives vendor wording).
 *   2. Heuristic string match (fallback for engine error chunks +
 *      anything else without typed-class metadata).
 *
 * The RAW error should ALWAYS be logged server-side via
 * `console.error('...', redactPII(err))` before reaching this function
 * — this function is the wire sanitizer of last resort, not the
 * primary observability path.
 */
export function classifyStreamError(error: unknown): ClassifiedStreamError {
  // ─── AI SDK typed errors (stable contract layer) ────────────────
  if (RetryError.isInstance(error)) {
    return {
      message:
        "We retried a few times and the service didn't come back. Please try again in a moment.",
      classification: "retry-exhausted",
    };
  }

  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 429) {
      return {
        message:
          "Too many requests in a short window. Please wait a moment and try again.",
        classification: "api-rate-limit",
      };
    }
    if (status === 401 || status === 403) {
      return {
        message: "Authentication issue with the model provider.",
        classification: "api-auth",
      };
    }
    if (status === 400 || status === 422) {
      return {
        message: "The model provider rejected the request. Please try again.",
        classification: "api-bad-request",
      };
    }
    if (typeof status === "number" && status >= 500) {
      return {
        message:
          "The model provider is having trouble right now. Please try again in 30 seconds.",
        classification: "api-server-error",
      };
    }
    // Status absent → the request never reached the server (DNS,
    // connection refused, socket hang up). Status present but
    // unhandled (rare 3xx / unusual 4xx) → fall through to a generic
    // api-call-error message rather than misclassifying as network.
    if (typeof status === "number") {
      return {
        message: "The model provider returned an error. Please try again.",
        classification: "api-call-error",
      };
    }
    return {
      message: "Couldn't reach the model provider. Please try again.",
      classification: "api-network",
    };
  }

  if (NoSuchToolError.isInstance(error)) {
    return {
      message:
        "The model tried to call a tool that doesn't exist. Please rephrase and try again.",
      classification: "no-such-tool",
    };
  }

  if (InvalidToolInputError.isInstance(error)) {
    return {
      message:
        "The model called a tool with invalid arguments. Please rephrase and try again.",
      classification: "invalid-tool-input",
    };
  }

  if (InvalidToolApprovalError.isInstance(error)) {
    return {
      message:
        "Tool approval response was invalid. Please refresh and try again.",
      classification: "invalid-tool-approval",
    };
  }

  if (ToolCallNotFoundForApprovalError.isInstance(error)) {
    return {
      message:
        "Couldn't match the approval to its tool call. Please refresh and try again.",
      classification: "tool-call-not-found",
    };
  }

  if (isToolExecutionErrorLike(error)) {
    // Unwrap once — the underlying cause is what the user cares about
    // (e.g. an SDK rejection, a Sui RPC failure). Recurse so the
    // typed-class checks above can apply to the cause too.
    return classifyStreamError(error.cause);
  }

  // ─── Heuristic fallback (raw strings / engine error chunks) ─────
  const raw = coerceToString(error);
  return classifyByHeuristic(raw);
}

/**
 * Heuristic-only classification for raw error strings. Exported so the
 * existing `safeErrorText` / engine-chunk error path can keep its
 * single string-in / string-out signature without round-tripping
 * through `classifyStreamError`.
 *
 * Kept verbatim (with classification tags added) from the pre-P6.3
 * `sanitizeStreamErrorMessage`. Engine emits friendly strings via
 * `friendlyErrorMessage` before throwing — those strings reach us as
 * plain `Error` instances with no typed-class provenance, so this
 * heuristic remains load-bearing.
 */
export function classifyByHeuristic(raw: string): ClassifiedStreamError {
  const lower = raw.toLowerCase();
  if (lower.includes("overloaded_error") || lower.includes('"overloaded"')) {
    return {
      message:
        "Anthropic's servers are over capacity right now. Please try again in 30 seconds.",
      classification: "provider-overloaded",
    };
  }
  if (lower.includes("rate_limit_error") || lower.includes('"status":429')) {
    return {
      message:
        "Too many requests in a short window. Please wait a moment and try again.",
      classification: "provider-rate-limit",
    };
  }
  if (
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up") ||
    lower.includes("fetch failed")
  ) {
    return {
      message:
        "Couldn't reach the model provider. Check your connection and try again.",
      classification: "provider-network",
    };
  }
  if (raw.trim().startsWith("{") && raw.trim().endsWith("}")) {
    return {
      message: "Something went wrong. Please try again.",
      classification: "provider-payload",
    };
  }
  if (
    lower.includes("prisma") ||
    lower.includes("prismaclient") ||
    lower.includes("p2025") ||
    lower.includes("p1001")
  ) {
    return {
      message: "Database error. Please try again.",
      classification: "database",
    };
  }
  return {
    message: raw,
    classification: "unknown",
  };
}

/**
 * Back-compat wrapper preserving the pre-P6.3 string-in / string-out
 * shape. Kept so existing call sites (engine `error` chunk handler in
 * `translateChunk`) don't need wholesale rewrites. New code should
 * prefer `classifyStreamError` to also receive the classification tag.
 */
export function sanitizeStreamErrorMessage(raw: string): string {
  return classifyByHeuristic(raw).message;
}

function coerceToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? "Unknown error";
  } catch {
    return "Unknown error";
  }
}
