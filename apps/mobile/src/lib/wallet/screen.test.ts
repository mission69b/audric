import { SUI_DECIMALS, toRawUnits } from "./amount";
import {
  clearSendDispatched,
  isDuplicateSend,
  markSendDispatched,
  preflightSend,
  sendDedupKey,
} from "./screen";

const ADDR = `0x${"a".repeat(64)}`;
const ADDR2 = `0x${"b".repeat(64)}`;
const SENDER = `0x${"1".repeat(64)}`;
const SENDER2 = `0x${"2".repeat(64)}`;

// Canonical dedup-key inputs share a base; each test overrides the field under test.
const base = {
  network: "testnet",
  sender: SENDER,
  to: ADDR,
  amountRaw: toRawUnits(1, SUI_DECIMALS),
  asset: "SUI" as const,
};

describe("preflightSend", () => {
  it("accepts a well-formed send", () => {
    expect(preflightSend({ to: ADDR, amountRaw: 1_000_000_000n, asset: "SUI" })).toEqual({
      ok: true,
    });
  });
  it("rejects a malformed address", () => {
    const r = preflightSend({ to: "0x123", amountRaw: 1_000_000_000n, asset: "SUI" });
    expect(r.ok).toBe(false);
  });
  it("rejects a non-positive raw amount", () => {
    expect(preflightSend({ to: ADDR, amountRaw: 0n, asset: "SUI" }).ok).toBe(false);
    expect(preflightSend({ to: ADDR, amountRaw: -1n, asset: "SUI" }).ok).toBe(false);
  });
});

describe("sendDedupKey (canonical raw-unit key)", () => {
  it("maps 0.1 and 0.10 to the SAME key (raw-unit canonicalization)", () => {
    const k1 = sendDedupKey({ ...base, amountRaw: toRawUnits(0.1, SUI_DECIMALS) });
    const k2 = sendDedupKey({ ...base, amountRaw: toRawUnits(0.10, SUI_DECIMALS) });
    expect(k1).toBe(k2);
  });

  it("differs by recipient", () => {
    expect(sendDedupKey(base)).not.toBe(sendDedupKey({ ...base, to: ADDR2 }));
  });

  it("differs by amount", () => {
    expect(sendDedupKey(base)).not.toBe(
      sendDedupKey({ ...base, amountRaw: toRawUnits(2, SUI_DECIMALS) })
    );
  });

  it("differs by network (no cross-chain collision)", () => {
    expect(sendDedupKey(base)).not.toBe(sendDedupKey({ ...base, network: "mainnet" }));
  });

  it("differs by sender (no cross-wallet collision)", () => {
    expect(sendDedupKey(base)).not.toBe(sendDedupKey({ ...base, sender: SENDER2 }));
  });
});

describe("dedup mechanics", () => {
  it("flags a repeat within the window", () => {
    const key = sendDedupKey({ ...base, sender: `0x${"c".repeat(64)}` });
    markSendDispatched(key, 1000);
    expect(isDuplicateSend(key, 5000)).toBe(true); // 4s later
    expect(isDuplicateSend(key, 62_000)).toBe(false); // >60s later
  });

  it("clearSendDispatched releases the lock so a retry is not flagged", () => {
    const key = sendDedupKey({ ...base, sender: `0x${"d".repeat(64)}` });
    markSendDispatched(key, 1000);
    expect(isDuplicateSend(key, 5000)).toBe(true);
    clearSendDispatched(key);
    expect(isDuplicateSend(key, 5000)).toBe(false);
  });
});
