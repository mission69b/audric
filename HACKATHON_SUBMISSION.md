# Audric — Sui Overflow 2026 Submission

> **Track:** Agentic Web · **Status:** Live in production on Sui mainnet at [audric.ai](https://audric.ai)
> This file is the submission packet (copy into the DeepSurge fields) + a judge-facing overview.

---

## DeepSurge fields (copy-paste ready)

| Field | Value |
|---|---|
| **Project Name** | Audric |
| **Track** | Agentic Web (Core Track) |
| **Website** | https://audric.ai |
| **Demo Video** | _(YouTube link, ≤5 min — script below)_ |
| **Public GitHub** | _(this repo)_ |
| **Deployment** | Sui **mainnet** (live app; composes USDC, USDsui, Walrus, Cetus, zkLogin/Enoki on mainnet) |
| **Logo** | 1:1 Audric mark (black diamond on off-white) |

### One-line description
**Audric is a private, non-custodial AI agent that holds and moves your money — sign in with Google, get a Sui wallet in seconds, and let an AI agent chat, research, and pay in USDC, all gaslessly.**

### Short description (≈50 words)
Audric is a private, decentralized AI agent on Sui. Sign in with Google (zkLogin) → a non-custodial wallet in seconds, no seed phrase. Chat with the best open + frontier models, do cited multi-step research, generate images, and send USDC/USDsui gaslessly — with encrypted memory on Walrus. You own your data, money, and memory.

---

## The problem

Two broken worlds:

1. **AI assistants you can't trust.** Every mainstream AI logs your prompts, trains on your data, and can refuse you. Your "memory" lives on their servers — they can read it, lock it, or pull it.
2. **Crypto wallets normal people can't use.** Seed phrases, gas tokens, bridging dust — the UX wall that keeps the agentic economy from reaching real users.

No one has fused them: an **AI agent that actually holds and moves money for a normal person**, privately, without a seed phrase or a gas token. That's the gap the agentic web has to cross — and it's only crossable on Sui.

## The solution

**Audric is the agent at the center of the agentic web for both humans and machines.** It's a private multi-model AI with a built-in non-custodial wallet:

- **Onboard in seconds** — Google sign-in → a real Sui wallet via zkLogin. No seed phrase, no extension, no gas token.
- **A real agent, not a chatbot** — Auto-routes each turn to the best model (open/uncensored or frontier), runs **visible, cited multi-step web research**, generates images, and reasons — transparently, step by step.
- **It holds and moves money** — send **USDC + USDsui gaslessly**, tap-to-confirm; the agent pays for live-data **Recipes** per-run in USDC via **x402 machine payments**. Every move is signed by you in-browser and verifiable on a public ledger.
- **Private + yours** — Zero-Data-Retention on every chat; chats/files encrypted and never public; **long-term memory encrypted on Walrus** (decentralized, off by default, wipe anytime). Non-custodial: we never hold your keys or your money.

## Why this wins the Agentic Web track

The problem statement asks for agents that **"deeply leverage Sui primitives beyond simple integrations."** Audric uses a *stack* of them, each load-bearing:

| Sui primitive | How Audric uses it (not a token-logo integration) |
|---|---|
| **zkLogin (Enoki)** | Google → non-custodial wallet in ~3s. The onboarding that makes a consumer AI agent with a wallet possible at all. |
| **Gasless stablecoin transfers (SIP-58 address balances + sponsored gas)** | Send USDC/USDsui with **zero SUI** — the user never touches a gas token. Solves the EVM/SVM "gas-dust" wall that blocks agent payments. |
| **Walrus** | The agent's **long-term memory** is encrypted and stored on Walrus — decentralized, verifiable, not a company DB. Memory you own, that can't be pulled. |
| **x402 machine payments** | The agent **pays for services per-run in USDC** (live-data Recipes). Payment is authentication — no API keys. This is the machine-payments half of the agentic web. |
| **Client-side zkLogin signing** | Every money write is signed **in the browser**; the server never holds keys. Non-custody by construction. |
| **Cetus** | Best-route swaps across 20+ DEXs from chat. |
| **SuiNS** | Human-readable `@audric` handles (subname minting) as payment identities. |

**Why Sui specifically:** Audric is impossible on EVM/SVM. Gasless stablecoin transfers (no native-gas requirement), zkLogin (Web2 onboarding to a real wallet), Walrus (decentralized private storage), and sponsored transactions together are the *only* substrate where a normal person can sign in with Google and have an AI agent hold and move real money — no seed phrase, no gas token, no custodian. Sui is the agentic-web chain.

## Built during the hackathon (eligibility)

Audric **v3** — the entire app in this repo (`apps/web-v3`) — was designed and built during the official window (clean-fork rebuild, shipped through May–June 2026, launched to production mid-June). It builds on our own pre-existing infrastructure libraries (`@t2000/sdk`, wallet/payments — permitted reuse of your own tooling), but the agent, the multi-model loop, zkLogin auth, gasless send, Walrus memory, x402 Recipes, the privacy system, and native billing are all new, in-window development. Disclosed transparently.

## Technical architecture

- **Agent loop:** AI SDK v6 over the Vercel AI Gateway (ZDR by default). Per-turn router classifies intent → picks model + reasoning effort + step budget ("Auto"). Tools: web search (Sonar), image gen, `balance_check` / `transaction_history` / `resolve_suins`, `send_transfer` (gasless USDC/USDsui, client-signed), `run_recipe` (x402 paid), `save_memory` (Walrus).
- **Wallet/payments:** `@t2000/sdk` (gRPC) — gasless USDC/USDsui send, Cetus swap, x402 pay. Money writes are **client-executed** (zkLogin signs in-browser; the server never touches keys).
- **Memory:** `@mysten-incubation/memwal` — encrypted vectors on Walrus; recalled per-turn when relevant; user owns it via a Passport-delegate model; "forget all" bumps an epoch so prior memories become un-recallable.
- **Auth/session:** Enoki zkLogin → derived Sui address; stateless HS256 httpOnly session (no server-side session store).
- **Storage:** private blob seam (`access:'private'`, no public URLs); Walrus + Seal is the post-launch decentralized-private upgrade.
- **Billing:** Stripe Elements (credit ledger + subscriptions), entirely in-app.
- **Stack:** Next.js 16 / React 19, Drizzle + Postgres, Tailwind + shadcn + AI Elements, Vercel.

## Traction (real-world application — 50% of the score)

- **Live in production** at audric.ai on Sui **mainnet** — not a testnet demo.
- **Real users with real money** — paid subscriptions (Stripe), real on-chain USDC/USDsui transfers, real Walrus memory writes.
- Polished, shipped UX: visible chain-of-thought research, inline image editing, clickable on-chain receipts, in-app billing, a privacy/settings hub with one-tap data deletion.

## Roadmap (vision — 10%)

The privacy ladder ends at *provably yours*: **Anon → Private·ZDR → Confidential (TEE) → Sealed (E2E on Walrus).**
- **Confidential (TEE) models** (Phala/RedPill) — verifiable, the provider can't read your prompt.
- **End-to-end sealed chats** (Seal on Walrus) — readable only by you.
- **Decentralized memory backup** on Walrus.
- **Agent Store** — creator marketplace, paid in USDC.
- **Machines-and-Humans:** the same rail lets autonomous agents spend on-chain, bounded and revocable — a capability no frontier lab offers.

---

## 🎬 Demo video script (≤5:00 — YouTube)

> Screen-record at audric.ai. Keep it brisk; narrate in English (or subtitle). Target 4:45.

**0:00–0:25 — Hook + problem**
> "This is Audric — a private AI agent that holds and moves your money, on Sui. Today's AI logs your data and can't touch money; crypto wallets need seed phrases and gas. Audric fuses them — and only Sui makes it possible."

**0:25–1:05 — zkLogin onboarding (Sui primitive #1)**
> Click "Sign in with Google." Land in the app with a wallet.
> "I just signed in with Google and got a real, non-custodial Sui wallet — no seed phrase, no extension, in about three seconds. That's zkLogin via Enoki."

**1:05–2:05 — The agent: research + Auto (the wow)**
> Type: *"Research the top privacy-focused AI apps in 2025."* Show Auto routing + the **live Chain-of-Thought timeline** running several web searches with cited sources → synthesis.
> "Audric picks the best model per turn, then does visible, cited multi-step research — you watch it work, every claim sourced. It also generates images and reasons, all on one rail, no API keys."

**2:05–3:05 — It holds and moves money (Sui primitives #2 + #4)**
> Show balance. Send USDC to a `@handle` / address → tap-to-confirm → show the receipt's **clickable Sui-explorer link**.
> "I just sent USDC — gaslessly. No SUI, no gas token. I signed it in my browser; the server never holds my keys, and the transaction's verifiable by anyone."
> Run a **Recipe** (e.g., Morning Brief) → confirm the USDC charge.
> "And the agent pays for live-data services itself, per-run in USDC, over x402 — machine payments. Payment is the API key."

**3:05–4:05 — Private + yours (Walrus — Sui primitive #3)**
> Ask it to remember a preference → it confirms the save. Open Settings → show Private Memory + "Forget all" + ZDR/encrypted/Walrus panel.
> "Audric's memory is encrypted on Walrus — decentralized storage, not our servers. It's off by default, and one tap wipes it. Every chat is zero-data-retention; your files are never public. You own your data, your money, and your memory."

**4:05–4:45 — Why Sui + traction + close**
> "Audric is live in production on Sui mainnet, with real paying users. zkLogin, gasless stablecoins, Walrus, and x402 are why a normal person can finally have an AI agent that holds money — privately, no seed phrase, no gas. Audric — private, decentralized AI, truly yours."

---

## Judging-criteria alignment (self-check)

- **Real-World Application (50%)** — live in production, mainnet, real paying users; solves a real fusion no one else has shipped.
- **Product & UX (20%)** — Google→wallet in 3s, visible cited research, gasless one-tap send, in-app billing, one-tap data deletion.
- **Technical Implementation (20%)** — deep, multi-primitive Sui usage (zkLogin, gasless SIP-58, Walrus, x402, client-side signing, Cetus, SuiNS); non-custodial by construction.
- **Presentation & Vision (10%)** — clear narrative + the provably-yours privacy ladder + Machines-and-Humans horizon.
