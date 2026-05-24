/**
 * Unit tests for `lib/audric/tool-call-repair.ts` —
 * SPEC_AI_SDK_HARDENING P3.2 (`experimental_repairToolCall`).
 *
 * Coverage targets:
 *  - NoSuchToolError → returns null without calling the model.
 *  - InvalidToolInputError → calls `generateText` with the right
 *    output spec + prompt shape; returns the repaired toolCall with
 *    stringified input.
 *  - Secondary call failure (provider outage, schema fetch failure,
 *    etc.) → returns null gracefully so the agent can re-plan.
 *  - The repaired toolCall preserves `toolCallId` + `toolName` + `type`
 *    — only `input` changes.
 *  - The repair prompt carries the bad input + validation error
 *    message verbatim so the model has full context.
 */

import { InvalidToolInputError, type LanguageModel, NoSuchToolError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: vi.fn() };
});

// eslint-disable-next-line import/order
import { generateText } from "ai";
// eslint-disable-next-line import/order
import { buildToolCallRepair } from "./tool-call-repair";

const mockedGenerateText = vi.mocked(generateText);

const FAKE_MODEL = {} as LanguageModel;

const buildToolCall = (overrides: {
  toolCallId?: string;
  toolName: string;
  input: string;
}) => ({
  type: "tool-call" as const,
  toolCallId: overrides.toolCallId ?? "tc-1",
  toolName: overrides.toolName,
  input: overrides.input,
});

const buildInputSchema =
  (schema: Record<string, unknown> = { type: "object" }) =>
  async () =>
    schema as never;

describe("buildToolCallRepair", () => {
  beforeEach(() => {
    mockedGenerateText.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {
      // suppress noisy logs in tests
    });
    vi.spyOn(console, "info").mockImplementation(() => {
      // suppress noisy logs in tests
    });
  });

  describe("NoSuchToolError path", () => {
    it("returns null without calling the model", async () => {
      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new NoSuchToolError({
        toolName: "fake_tool",
        availableTools: ["balance_check", "save_deposit"],
      });

      const result = await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolName: "fake_tool",
          input: "{}",
        }),
        tools: {} as never,
        inputSchema: buildInputSchema(),
        error: err,
      });

      expect(result).toBeNull();
      expect(mockedGenerateText).not.toHaveBeenCalled();
    });

    it("logs a warn line tagged with the tool name", async () => {
      const warn = vi.spyOn(console, "warn");
      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new NoSuchToolError({
        toolName: "phantom_tool",
        availableTools: ["balance_check"],
      });

      await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolName: "phantom_tool",
          input: "{}",
        }),
        tools: {} as never,
        inputSchema: buildInputSchema(),
        error: err,
      });

      expect(warn).toHaveBeenCalled();
      const firstCallArg = warn.mock.calls[0]?.[0] as string;
      expect(firstCallArg).toContain("tool-call-repair");
      expect(firstCallArg).toContain("NoSuchToolError");
      expect(firstCallArg).toContain("phantom_tool");
    });
  });

  describe("InvalidToolInputError path — successful repair", () => {
    it("calls generateText and returns the repaired toolCall", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        output: { amount: 5, asset: "USDC" },
      } as never);

      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new InvalidToolInputError({
        toolName: "save_deposit",
        toolInput: '{"amount":-5}',
        cause: new Error("amount must be positive"),
      });

      const result = await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolCallId: "tc-repair",
          toolName: "save_deposit",
          input: '{"amount":-5}',
        }),
        tools: {} as never,
        inputSchema: buildInputSchema({
          type: "object",
          properties: {
            amount: { type: "number" },
            asset: { type: "string" },
          },
          required: ["amount"],
        }),
        error: err,
      });

      expect(result).not.toBeNull();
      expect(result?.type).toBe("tool-call");
      expect(result?.toolCallId).toBe("tc-repair");
      expect(result?.toolName).toBe("save_deposit");
      expect(result?.input).toBe(JSON.stringify({ amount: 5, asset: "USDC" }));
      expect(mockedGenerateText).toHaveBeenCalledTimes(1);
    });

    it("includes the bad input + error message verbatim in the prompt", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        output: { amount: 10 },
      } as never);

      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new InvalidToolInputError({
        toolName: "borrow",
        toolInput: '{"amount":"ten"}',
        cause: new Error("Expected number, received string"),
      });

      await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolName: "borrow",
          input: '{"amount":"ten"}',
        }),
        tools: {} as never,
        inputSchema: buildInputSchema(),
        error: err,
      });

      const callArgs = mockedGenerateText.mock.calls[0]?.[0] as {
        prompt: string;
      };
      // Bad input present
      expect(callArgs.prompt).toContain('"amount": "ten"');
      // Validation error message present (from err.message — AI SDK wraps cause)
      expect(callArgs.prompt).toContain(err.message);
      // Tool name present
      expect(callArgs.prompt).toContain("borrow");
    });

    it("passes the model from opts to generateText", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        output: {},
      } as never);

      const sentinel = { __sentinel: true } as unknown as LanguageModel;
      const repair = buildToolCallRepair({ model: sentinel });
      const err = new InvalidToolInputError({
        toolName: "save_deposit",
        toolInput: "{}",
        cause: new Error("Missing required field: amount"),
      });

      await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolName: "save_deposit",
          input: "{}",
        }),
        tools: {} as never,
        inputSchema: buildInputSchema(),
        error: err,
      });

      const callArgs = mockedGenerateText.mock.calls[0]?.[0] as {
        model: unknown;
      };
      expect(callArgs.model).toBe(sentinel);
    });

    it("falls back to raw input string when input is not parseable JSON", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        output: { amount: 1 },
      } as never);

      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new InvalidToolInputError({
        toolName: "save_deposit",
        toolInput: "{ this isn't valid JSON",
        cause: new Error("Unexpected token"),
      });

      const result = await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolName: "save_deposit",
          input: "{ this isn't valid JSON",
        }),
        tools: {} as never,
        inputSchema: buildInputSchema(),
        error: err,
      });

      // Falls back to raw string in the prompt (doesn't crash); still
      // returns a repaired toolCall.
      expect(result).not.toBeNull();
      const callArgs = mockedGenerateText.mock.calls[0]?.[0] as {
        prompt: string;
      };
      expect(callArgs.prompt).toContain("{ this isn't valid JSON");
    });

    it("preserves toolCallId across repair (so SDK can match the response)", async () => {
      mockedGenerateText.mockResolvedValueOnce({
        output: { amount: 1 },
      } as never);

      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new InvalidToolInputError({
        toolName: "save_deposit",
        toolInput: "{}",
        cause: new Error("Missing amount"),
      });

      const result = await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolCallId: "preserve-this-id-42",
          toolName: "save_deposit",
          input: "{}",
        }),
        tools: {} as never,
        inputSchema: buildInputSchema(),
        error: err,
      });

      expect(result?.toolCallId).toBe("preserve-this-id-42");
    });
  });

  describe("InvalidToolInputError path — graceful failure", () => {
    it("returns null when generateText throws", async () => {
      mockedGenerateText.mockRejectedValueOnce(new Error("Provider outage"));

      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new InvalidToolInputError({
        toolName: "save_deposit",
        toolInput: "{}",
        cause: new Error("Missing amount"),
      });

      const result = await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolName: "save_deposit",
          input: "{}",
        }),
        tools: {} as never,
        inputSchema: buildInputSchema(),
        error: err,
      });

      expect(result).toBeNull();
    });

    it("returns null when inputSchema throws (and does not call the model)", async () => {
      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new InvalidToolInputError({
        toolName: "save_deposit",
        toolInput: "{}",
        cause: new Error("Missing amount"),
      });

      const result = await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolName: "save_deposit",
          input: "{}",
        }),
        tools: {} as never,
        inputSchema: () => Promise.reject(new Error("schema fetch failed")),
        error: err,
      });

      expect(result).toBeNull();
      expect(mockedGenerateText).not.toHaveBeenCalled();
    });

    it("logs a warn line on secondary-call failure (with PII redaction)", async () => {
      const warn = vi.spyOn(console, "warn");
      mockedGenerateText.mockRejectedValueOnce(
        new Error(
          "Network failure for 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        )
      );

      const repair = buildToolCallRepair({ model: FAKE_MODEL });
      const err = new InvalidToolInputError({
        toolName: "save_deposit",
        toolInput: "{}",
        cause: new Error("Missing amount"),
      });

      await repair({
        system: undefined,
        messages: [],
        toolCall: buildToolCall({
          toolName: "save_deposit",
          input: "{}",
        }),
        tools: {} as never,
        inputSchema: buildInputSchema(),
        error: err,
      });

      // Find the secondary-call warn (skip any earlier warns like NoSuchToolError).
      const secondaryWarn = warn.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          (call[0] as string).includes("secondary call failed")
      );
      expect(secondaryWarn).toBeDefined();
      // PII redacted — full address should NOT appear in the log line.
      const logLine = secondaryWarn?.[0] as string;
      expect(logLine).not.toContain(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      );
    });
  });
});
