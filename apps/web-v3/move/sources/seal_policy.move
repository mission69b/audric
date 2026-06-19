/// Audric Seal access policy — owner-only decryption.
///
/// Seal binds every ciphertext to an identity `id` under this package. For
/// private user data (artifacts, memory) the identity IS the owner's address
/// bytes, optionally followed by an app-chosen nonce:  `id = <owner_addr>[..nonce]`.
///
/// On decryption the Seal MPC committee dry-runs `seal_approve(id)` as if the
/// requester sent it (`TxContext::sender()` = the SessionKey signer = the
/// Passport zkLogin address). Access is granted iff the requester owns the
/// identity — i.e. their address is the prefix of `id`. No on-chain object,
/// no mandate, no rotation: the policy is pure address ownership, so a user
/// can ONLY ever decrypt data encrypted to their own Passport.
module audric_seal::seal_policy;

use sui::address;

const ENoAccess: u64 = 1;

/// Grant key access iff the caller's address is the prefix of `id`.
/// Aborts (no key released) otherwise. Side-effect free, as Seal requires.
entry fun seal_approve(id: vector<u8>, ctx: &TxContext) {
    assert!(is_prefix(address::to_bytes(tx_context::sender(ctx)), id), ENoAccess);
}

/// True iff `prefix` is a leading subsequence of `full`.
fun is_prefix(prefix: vector<u8>, full: vector<u8>): bool {
    let plen = vector::length(&prefix);
    if (plen > vector::length(&full)) {
        return false
    };
    let mut i = 0;
    while (i < plen) {
        if (*vector::borrow(&prefix, i) != *vector::borrow(&full, i)) {
            return false
        };
        i = i + 1;
    };
    true
}

#[test]
fun prefix_logic() {
    assert!(is_prefix(vector[1, 2], vector[1, 2, 3]), 0); // owner-addr prefix of id+nonce
    assert!(is_prefix(vector[1, 2, 3], vector[1, 2, 3]), 0); // exact owner-only id
    assert!(is_prefix(vector[], vector[1]), 0); // empty prefix matches
    assert!(!is_prefix(vector[1, 2], vector[9, 2, 3]), 0); // different owner
    assert!(!is_prefix(vector[1, 2, 3], vector[1, 2]), 0); // prefix longer than id
}
