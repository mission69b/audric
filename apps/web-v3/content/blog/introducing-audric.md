---
title: Introducing Audric
date: 2026-06-22
description: A private, multi-model AI with a wallet built in — and it's yours. Your data, your memory, your money. Sign in with Google. No seed phrase, no KYC.
author: funkii
---

Most AI runs on someone else's servers, on their terms. Your chats, your history, your account — and often your conversations, turned into training data.

Audric is different. A private, multi-model AI with a wallet built in. Sign in with Google, and in seconds you have every major model, a wallet, and an account where your data stays yours. Encrypted. Never sold. Never used to train models.

![The Audric chat — private by default, with zero data retention.](/blog/empty-state.png)

## Three things, one place

- **A private assistant.** Every model, and your conversations are never used to train them.
- **A real agent.** It searches the web, runs cited research, generates images and video, and pulls live market data.
- **A wallet.** Yours, created from your Google sign-in. Nothing to set up.

What ties them together is ownership. None of it has to pass through us to be useful.

## Why ownership matters

When a company hosts your AI, they hold the leverage. They can change the model, lock the context you've built, read your chats, train on them, or cut off your access.

Audric flips that. The model access, the wallet, and the memory are yours. What you own can't be quietly changed, read, or taken away. That's practical, not ideological.

## How your privacy works

- **Your chats.** Saved to your private history so you can pick up where you left off. Encrypted, readable only by you, and deletable anytime — one chat, all chats, or everything. Never sold, never training data.
- **Zero data retention.** Every message runs through a gateway that tells the model provider to answer and forget. Nothing kept, nothing trained on. On by default, for every chat.
- **Memory.** Separate from your chats, and off by default. Memory is a small set of facts you let Audric keep — your preferences, goals, context — so it doesn't start over each time. Turn it on and those facts are encrypted and stored on Walrus, a decentralized network rather than our servers. Turn it off and recall stops. Wipe it anytime.
- **Your files.** Anything you create is encrypted and served only to you. Never a public link.

Your chats live in your private history. Your memory, if you turn it on, lives encrypted on Walrus. Two different things — and both are yours to delete.

![Audric's Privacy and storage settings — zero data retention, encrypted private chats and files, and decentralized memory.](/blog/privacy-storage.png)

## Every model — and the right one, automatically

Audric isn't one model behind a brand. Open and uncensored models — Kimi, DeepSeek, Grok, GPT-OSS — sit next to the frontier, like Claude Opus 4.8 and GPT-5.5. Switch between any of them mid-conversation. The open ones won't refuse you.

Or leave it on **Auto**. It reads each request and picks the model and the effort to match — a quick reply on a fast model, deep thinking on a frontier one. Every model shows a privacy badge and its real cost, so you always know what you're using.

![Audric's model picker — every model with a privacy badge and its real cost, and Auto on by default.](/blog/model-picker.png)

## What the agent can do

Audric is an agent, not just a chatbot.

- **Web search** — current results, with sources you can click.
- **Research** — for bigger questions it runs a sequence of searches, shows each step, and ends with an answer that cites every source.
- **Images** — generated right in the conversation.

![Audric running several live web searches with clickable sources, then a cited synthesis.](/blog/research.mp4)

## Your wallet, your money

Every account comes with an **Audric Passport** — a wallet created from your Google sign-in. No seed phrase to write down. No keys for us to hold.

- **Send USDC and USDsui** to anyone — free, instant, and gasless. We cover the network fees, so you never hold a separate gas token.
- **You decide.** Audric never moves money on its own. Every transaction waits for your tap.
- **Verifiable.** Every move settles on Sui and is signed by you. We can't touch your funds.

![Sending USDC in chat — tap to confirm, gasless, then verifiable on-chain.](/blog/send.mp4)

## Where privacy goes next

Today's default is strong. Each step from here adds privacy you can verify, not just trust.

1. **Private** — today's default. Never retained, never trained on.
2. **Confidential** — live now. Flip the toggle and your turn runs inside a secure enclave, where even the provider can't read it — with a proof you can [check yourself](https://verify.t2000.ai).
3. **Sealed** — coming. End-to-end encrypted chats, readable only by you.

## Under the hood

The stack is chosen so privacy and ownership are built in, not promised.

![Audric architecture — your request routes through Auto and a zero-retention gateway to the models; opt-in memory is encrypted on Walrus; money settles gaslessly on Sui.](/blog/uth-arch.png)

**Sign-in and wallet.** Signing in with Google creates a Sui wallet. The signing key is made on your device and never leaves it — so the wallet is genuinely yours, and we couldn't move your money if we tried.

**The zero-retention gateway.** Every request goes through one gateway set to zero retention: the provider answers and forgets. It's also what puts every model behind a single door.

![A prompt's lifecycle — source, Auto, zero-retention gateway, the model answers, back to you. Nothing stored, nothing trained on.](/blog/uth-lifecycle.png)

**Auto.** It reads each request and routes it to the right model and effort. One door, many models. You never wire anything up.

**Memory on Walrus.** When you opt in, memory is encrypted and spread across Walrus, a decentralized network no single company owns. It can't be quietly locked or pulled, and "Forget all" wipes it.

**Money on Sui.** Sends are simple stablecoin transfers — no gas token, because the fees are sponsored. Every move is signed by you and settles on a public ledger anyone can check.

![The four layers — Identity, Models, Memory, Money.](/blog/uth-layers.png)

When the models, the money, the identity, and the memory are all yours — encrypted, and where possible on storage no one else controls — none of it can be taken away.

## Pricing

- **Free** — the open model, web search, images, and research. No card.
- **Pro ($18/mo)** and **Max ($100/mo)** — every premium and frontier model, plus monthly credit that rolls over.

Pay-as-you-go works on any plan. Full breakdown on the [pricing page](https://audric.ai/pricing).

## Get started

Audric is live at [audric.ai](https://audric.ai). Try it before you sign in — or sign in with Google and have a private AI and a wallet in seconds. No card, no seed phrase.

Own your AI, your data, and your money.
