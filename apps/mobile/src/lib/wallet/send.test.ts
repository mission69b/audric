// SUI_NETWORK defaults to "mainnet" in the test env (no EXPO_PUBLIC_SUI_NETWORK), which
// would trip sendSui's testnet-only gate first. Mock it to testnet so the guards under
// test are reachable. keys is mocked so no SecureStore/network is touched.
jest.mock("@/lib/audric-web", () => ({ SUI_NETWORK: "testnet" }));
jest.mock("./keys", () => ({
  loadWalletKeys: jest.fn(),
  isProofExpired: () => false,
}));
// The guards under test all throw before any transaction is built or broadcast, so the
// heavy ESM SDK modules (which jest can't transform) are stubbed — never exercised here.
jest.mock("@mysten/sui/grpc", () => ({ SuiGrpcClient: class {} }));
jest.mock("@mysten/sui/keypairs/ed25519", () => ({
  Ed25519Keypair: { fromSecretKey: () => ({}) },
}));
jest.mock("./build", () => ({ buildSuiTransferTx: jest.fn() }));
jest.mock("./signer", () => ({ ZkLoginSigner: class {} }));

import { loadWalletKeys } from "./keys";
import { sendSui } from "./send";

const A = `0x${"a".repeat(64)}`;
const B = `0x${"b".repeat(64)}`;

const keysFor = (address: string) => ({
  ephemeralSecret: "suiprivkey1qq",
  proof: {} as never,
  maxEpoch: 100,
  address,
  expiresAt: Date.now() + 60 * 60 * 1000,
});

describe("sendSui money-path guards", () => {
  beforeEach(() => {
    (loadWalletKeys as jest.Mock).mockReset();
  });

  it("rejects sub-unit precision BEFORE loading keys (no rounding into a new amount)", async () => {
    await expect(
      sendSui({ to: A, amount: "0.0000000015", expectedAddress: A })
    ).rejects.toThrow(/decimals/i);
    expect(loadWalletKeys).not.toHaveBeenCalled();
  });

  it("rejects a zero amount", async () => {
    await expect(sendSui({ to: A, amount: "0", expectedAddress: A })).rejects.toThrow(
      /greater than zero/i
    );
  });

  it("rejects a stale wrong-account key set (on-device keys ≠ session address)", async () => {
    // SecureStore still holds account A's keys, but this session authenticated as B.
    // The guard throws at the address check — before any dedup/gRPC/network work.
    (loadWalletKeys as jest.Mock).mockResolvedValue(keysFor(A));
    await expect(
      sendSui({ to: B, amount: "0.1", expectedAddress: B })
    ).rejects.toThrow(/session changed/i);
  });

  it("rejects when there are no on-device keys at all", async () => {
    (loadWalletKeys as jest.Mock).mockResolvedValue(null);
    await expect(
      sendSui({ to: B, amount: "0.1", expectedAddress: A })
    ).rejects.toThrow(/sign in/i);
  });
});
