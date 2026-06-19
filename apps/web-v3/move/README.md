# `audric_seal` — Seal access policy

The on-chain access policy for Audric's private data (artifacts + memory). Seal's
MPC committee dry-runs `seal_policy::seal_approve(id)` before releasing decryption
key shares — it's the lock that makes "only you can decrypt your data" enforceable
on-chain, not a promise. The Seal API key authenticates us to the committee; THIS
module decides who's allowed.

`id = <owner_address_bytes>[..nonce]` → a user can only ever decrypt data encrypted
to their own Passport address.

## Publish (mainnet, one-time)

Needs a **funded mainnet Sui keypair** (a few cents of SUI for gas). The resulting
`packageId` is permanent — record it as `SEAL_POLICY_PACKAGE_ID`.

```bash
cd apps/web-v3/move

# free + local — validates syntax + the prefix predicate before any spend
sui move build
sui move test

# publish to mainnet (spends real SUI; prints the new packageId)
sui client switch --env mainnet
sui client publish --gas-budget 50000000
```

From the publish output, copy the **published package** object ID (the immutable
`packageId`, not the `UpgradeCap`) into `.env.local`:

```
SEAL_POLICY_PACKAGE_ID=0x...
```

That ID is what the app passes to `seal.encrypt({ packageId, id, ... })` and to the
`seal_approve` call in the decrypt PTB. After this lands, the next step wires the
TS round-trip (SessionKey via our zkLogin signer → encrypt → decrypt) against it.
