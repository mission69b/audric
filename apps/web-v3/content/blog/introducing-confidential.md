---
title: "Introducing Confidential: privacy you can prove"
date: 2026-07-01
description: Flip one toggle and your chat runs inside a secure enclave — even we can't read it. Every response comes with a proof, anchored on Sui, that you can check yourself.
author: funkii
---

Audric is private by default. Confidential goes one step further: your chat runs inside a sealed chip that no one — not the model provider, not us — can see into. And you don't have to take our word for it. You can prove it.

## Turn it on

Flip the **Confidential** toggle in the composer. Your turn runs inside a secure enclave — a locked-down piece of hardware where your prompt is decrypted, answered, and never exposed to the outside. The provider can't read it. We can't read it. Then pick a confidential model — GLM, Kimi, DeepSeek, and more — and chat as normal.

Confidential mode is a pure, private conversation. No web search, no tools, no memory this mode — that's what keeps it sealed inside the enclave.

## Prove it yourself

This is the part that matters: every confidential response comes with a proof.

- The enclave signs your response with a key only it holds.
- A fingerprint of that response is anchored on **Sui** — a public, permanent record, timestamped and tamper-evident.
- No prompts, no identities, no content ever leaves — only a hash.

Check any response yourself at [verify.t2000.ai](https://verify.t2000.ai), or from your terminal with `t2 verify`. You're not trusting a privacy promise. You're checking a receipt.

## Where it fits

Confidential is the second rung of a ladder, each step adding privacy you can verify rather than trust:

1. **Private** — the default. Never retained, never trained on.
2. **Confidential** — this. Runs in a secure enclave, with an on-chain proof you can check.
3. **Sealed** — coming. End-to-end encrypted chats, readable only by you.

Confidential is on **Pro and Max**. It's the strongest privacy you can get in an AI today — and the only one that hands you the proof.

Try it at [audric.ai](https://audric.ai).
