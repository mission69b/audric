import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getZkLoginSignature } from "@mysten/sui/zklogin";
import type { ZkProof } from "./keys";

// Mirrors @t2000/sdk's ZkLoginSigner: the ephemeral key signs the tx bytes, then
// getZkLoginSignature wraps that with the zkProof (which carries the addressSeed)
// into the final zkLogin signature Sui verifies.
export class ZkLoginSigner {
  constructor(
    private readonly keypair: Ed25519Keypair,
    private readonly proof: ZkProof,
    private readonly address: string,
    private readonly maxEpoch: number
  ) {}

  getAddress(): string {
    return this.address;
  }

  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    const { signature: userSignature } = await this.keypair.signTransaction(txBytes);
    const signature = getZkLoginSignature({
      inputs: this.proof,
      maxEpoch: this.maxEpoch,
      userSignature,
    });
    return { signature };
  }
}
