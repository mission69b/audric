/**
 * Unit tests for `lib/audric/stream-errors.ts` — SPEC_AI_SDK_HARDENING
 * P6.3 (typed-error classification + heuristic fallback).
 *
 * Coverage targets:
 *  - Every AI SDK typed-error branch (`isInstance` predicates) returns
 *    its stable classification tag.
 *  - `APICallError` status-code switch (429 / 401 / 4xx / 5xx / network).
 *  - Heuristic fallback fires for raw strings without typed-class
 *    provenance (the engine's `friendlyErrorMessage` path).
 *  - Back-compat wrapper `sanitizeStreamErrorMessage` preserves the
 *    pre-P6.3 string-in / string-out shape.
 *
 * Why typed-class tests matter: the whole point of P6.3 is that
 * vendor wording changes (Anthropic, OpenAI, etc.) DON'T break our
 * classification. The typed-class branches must be stable across
 * vendor changes; heuristic-only would silently break.
 */

import {
  APICallError,
  InvalidToolApprovalError,
  InvalidToolInputError,
  NoSuchToolError,
  RetryError,
  ToolCallNotFoundForApprovalError,
} from "ai";
import { describe, expect, it } from "vitest";
import {
  classifyByHeuristic,
  classifyStreamError,
  sanitizeStreamErrorMessage,
} from "./stream-errors";

describe("classifyStreamError — AI SDK typed-class branches", () => {
  it("classifies RetryError as retry-exhausted", () => {
    const err = new RetryError({
      message: "Retried 3 times",
      reason: "maxRetriesExceeded",
      errors: [new Error("attempt 1"), new Error("attempt 2")],
    });
    const result = classifyStreamError(err);
    expect(result.classification).toBe("retry-exhausted");
    expect(result.message).toMatch(/retried/i);
  });

  it("classifies APICallError 429 as api-rate-limit", () => {
    const err = new APICallError({
      message: "Too Many Requests",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 429,
    });
    const result = classifyStreamError(err);
    expect(result.classification).toBe("api-rate-limit");
    expect(result.message).toMatch(/too many requests/i);
  });

  it("classifies APICallError 401 as api-auth", () => {
    const err = new APICallError({
      message: "Unauthorized",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 401,
    });
    expect(classifyStreamError(err).classification).toBe("api-auth");
  });

  it("classifies APICallError 403 as api-auth", () => {
    const err = new APICallError({
      message: "Forbidden",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 403,
    });
    expect(classifyStreamError(err).classification).toBe("api-auth");
  });

  it("classifies APICallError 400 as api-bad-request", () => {
    const err = new APICallError({
      message: "Bad Request",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 400,
    });
    expect(classifyStreamError(err).classification).toBe("api-bad-request");
  });

  it("classifies APICallError 422 as api-bad-request", () => {
    const err = new APICallError({
      message: "Unprocessable Entity",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 422,
    });
    expect(classifyStreamError(err).classification).toBe("api-bad-request");
  });

  it("classifies APICallError 500 as api-server-error", () => {
    const err = new APICallError({
      message: "Internal Server Error",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 500,
    });
    expect(classifyStreamError(err).classification).toBe("api-server-error");
  });

  it("classifies APICallError 503 as api-server-error", () => {
    const err = new APICallError({
      message: "Service Unavailable",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 503,
    });
    expect(classifyStreamError(err).classification).toBe("api-server-error");
  });

  it("classifies APICallError with unhandled 3xx status as api-call-error", () => {
    const err = new APICallError({
      message: "Moved Permanently",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 301,
    });
    expect(classifyStreamError(err).classification).toBe("api-call-error");
  });

  it("classifies APICallError without status as api-network", () => {
    // No statusCode = request never reached server (DNS / TCP failure).
    const err = new APICallError({
      message: "Network failure",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
    });
    expect(classifyStreamError(err).classification).toBe("api-network");
  });

  it("classifies NoSuchToolError as no-such-tool", () => {
    const err = new NoSuchToolError({
      toolName: "nonexistent_tool",
      availableTools: ["balance_check", "save_deposit"],
    });
    const result = classifyStreamError(err);
    expect(result.classification).toBe("no-such-tool");
    expect(result.message).toMatch(/tool that doesn't exist/i);
  });

  it("classifies InvalidToolInputError as invalid-tool-input", () => {
    const err = new InvalidToolInputError({
      toolName: "save_deposit",
      toolInput: "{}",
      cause: new Error("Missing amount"),
    });
    const result = classifyStreamError(err);
    expect(result.classification).toBe("invalid-tool-input");
    expect(result.message).toMatch(/invalid arguments/i);
  });

  it("classifies InvalidToolApprovalError as invalid-tool-approval", () => {
    const err = new InvalidToolApprovalError({
      approvalId: "approval-123",
    });
    const result = classifyStreamError(err);
    expect(result.classification).toBe("invalid-tool-approval");
  });

  it("classifies ToolCallNotFoundForApprovalError as tool-call-not-found", () => {
    const err = new ToolCallNotFoundForApprovalError({
      toolCallId: "toolcall-123",
      approvalId: "approval-123",
    });
    expect(classifyStreamError(err).classification).toBe("tool-call-not-found");
  });
});

describe("classifyStreamError — heuristic fallback (no typed-class provenance)", () => {
  it("classifies Anthropic overloaded JSON as provider-overloaded", () => {
    const err = new Error(
      'API error: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'
    );
    const result = classifyStreamError(err);
    expect(result.classification).toBe("provider-overloaded");
    expect(result.message).toMatch(/over capacity/i);
  });

  it("classifies rate_limit_error string as provider-rate-limit", () => {
    const err = new Error("Got rate_limit_error from upstream");
    expect(classifyStreamError(err).classification).toBe("provider-rate-limit");
  });

  it('classifies "status":429 in error body as provider-rate-limit', () => {
    const err = new Error('Response: {"status":429,"message":"Too many"}');
    expect(classifyStreamError(err).classification).toBe("provider-rate-limit");
  });

  it("classifies ECONNRESET as provider-network", () => {
    const err = new Error("fetch failed: ECONNRESET");
    expect(classifyStreamError(err).classification).toBe("provider-network");
  });

  it("classifies socket hang up as provider-network", () => {
    const err = new Error("socket hang up");
    expect(classifyStreamError(err).classification).toBe("provider-network");
  });

  it("classifies raw JSON payload as provider-payload", () => {
    const err = new Error('{"error":"raw payload leaked"}');
    expect(classifyStreamError(err).classification).toBe("provider-payload");
  });

  it("classifies Prisma errors as database", () => {
    const err = new Error("PrismaClientKnownRequestError: P2025 not found");
    expect(classifyStreamError(err).classification).toBe("database");
  });

  it("classifies P1001 connection error as database", () => {
    const err = new Error("P1001: Can't reach database server");
    expect(classifyStreamError(err).classification).toBe("database");
  });

  it("returns 'unknown' classification + raw message for unrecognized errors", () => {
    const err = new Error("Some unexpected error nobody planned for");
    const result = classifyStreamError(err);
    expect(result.classification).toBe("unknown");
    expect(result.message).toBe("Some unexpected error nobody planned for");
  });

  it("coerces plain strings to the heuristic path", () => {
    const result = classifyStreamError("plain error string");
    expect(result.classification).toBe("unknown");
    expect(result.message).toBe("plain error string");
  });

  it("coerces non-Error objects via JSON.stringify", () => {
    const result = classifyStreamError({ weird: "shape" });
    expect(result.classification).toBe("provider-payload");
  });
});

describe("sanitizeStreamErrorMessage — back-compat wrapper", () => {
  it("returns the heuristic message string (string-in / string-out)", () => {
    expect(sanitizeStreamErrorMessage("overloaded_error happened")).toMatch(
      /over capacity/i
    );
  });

  it("returns raw string when no heuristic matches (preserved pre-P6.3 behavior)", () => {
    expect(sanitizeStreamErrorMessage("some unhandled message")).toBe(
      "some unhandled message"
    );
  });

  it("classifies raw JSON payloads as provider-payload (the safety net)", () => {
    expect(sanitizeStreamErrorMessage('{"foo":"bar"}')).toBe(
      "Something went wrong. Please try again."
    );
  });
});

describe("classifyByHeuristic — exported directly for engine-chunk path", () => {
  it("returns both message + classification (full ClassifiedStreamError shape)", () => {
    const result = classifyByHeuristic("ECONNRESET");
    expect(result).toEqual({
      message: expect.stringMatching(/couldn't reach/i),
      classification: "provider-network",
    });
  });
});
