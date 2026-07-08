import type { Metadata } from "next";
import Link from "next/link";
import { ClientInstallTabs } from "@/components/client-install-tabs";
import { CopyButton } from "@/components/copy-button";

// agents.t2000.ai/buy — the buyer on-ramp (Store v2 Phase 3, SPEC_STORE_V2 §7).
// Founder 2026-07-08: prompts render VISIBLY (read first, copy second) and the
// page is ONE sell-style road — numbered steps, one visible prompt per step,
// no parallel funnels. "Already have an agent" = start at step 2.

export const metadata: Metadata = {
  title: "Buy — hire agents, pay per call",
  description:
    "No registration to buy. Set up your agent's wallet with one prompt, fund it with USDC, and buy any service on the store — pay on delivery, automatic refunds, receipts on Sui.",
  openGraph: { images: ["/og-agents.png"] },
  twitter: { images: ["/og-agents.png"] },
};

// One paste into Claude Code / Cursor / Codex / any terminal agent: wallet
// setup via the read-only skill, then funding.
const SETUP_PROMPT = [
  "Run curl -sL https://t2000.ai/skills/t2000-setup, and use the returned setup instructions to set up my t2000 Agent Wallet (it's config-only — it never moves funds).",
  "",
  "Then run `t2 fund` and show me the deposit address + QR so I can send it a few dollars of USDC (everything is gasless — no SUI needed, and there is no account to register: the funded wallet IS the account).",
].join("\n");

// The hero demo (SPEC_STORE_V2 §7 — the founder's morning-brief script).
const DEMO_PROMPT = [
  "Buy the Morning Market Brief from the t2000 agent store and show it to me:",
  "",
  "t2 agent pay 0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf --service daily-brief --max-price 0.15",
  "",
  "It costs $0.10 in USDC, pays on delivery (a failed delivery refunds automatically), and settles on Sui — show me the brief and the settlement digest.",
].join("\n");

// The Private API on-ramp (the same wallet funds it — one command mints the
// key). Copy stays factual to developers.t2000.ai/private-api.
const PRIVATE_API_PROMPT = [
  "Run `t2 agent onboard --fund 5` to fund $5 of t2000 API credit from my Agent Wallet and mint a Private API key.",
  "",
  "Then configure yourself (or any OpenAI-compatible client) to use it: base URL https://api.t2000.ai/v1, the minted key, and list the models with GET /v1/models — private open + confidential (TEE) models, zero retention.",
].join("\n");

// A prompt you can READ before you copy — the whole point of the page
// (founder: "show the prompt visibly so users read it straight away").
function PromptBlock({ text, command }: { text: string; command?: boolean }) {
  return (
    <div className="ag-term relative max-w-[640px]">
      <div
        className="body whitespace-pre-wrap"
        style={{
          fontSize: 12.5,
          lineHeight: 1.6,
          padding: "12px 84px 12px 14px",
        }}
      >
        {command && <span className="m">$ </span>}
        {text}
      </div>
      <span className="absolute top-2 right-2">
        <CopyButton text={text} />
      </span>
    </div>
  );
}

const STEPS: {
  n: number;
  title: string;
  body: React.ReactNode;
  prompt?: string;
  command?: boolean;
  optional?: boolean;
  custom?: React.ReactNode;
}[] = [
  {
    n: 1,
    title: "Install an agent client",
    body: (
      <>
        Pick whichever you already like — they all drive the same wallet. Zero
        install:{" "}
        <a
          className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          href="https://audric.ai"
          rel="noreferrer"
          target="_blank"
        >
          Audric
        </a>{" "}
        has the wallet built in — sign in with Google and skip to step 3.
      </>
    ),
    custom: <ClientInstallTabs />,
  },
  {
    n: 2,
    title: "Paste this — it sets up the wallet",
    body: "Your agent installs the CLI, creates a local wallet (keys never leave the machine, spending limits on by default), and shows you where to send a few dollars of USDC. No account, no API key — the funded wallet IS the account.",
    prompt: SETUP_PROMPT,
  },
  {
    n: 3,
    title: "Paste this — it makes the first buy",
    body: "The store's composed read: one paid call, the full report back in seconds, the settlement digest on Sui. A failed delivery refunds automatically.",
    prompt: DEMO_PROMPT,
  },
  {
    n: 4,
    title: "Optional: power it with private models",
    body: "The same wallet can mint a Private API key — open + confidential models (DeepSeek, GLM, gpt-oss, TEE-attested options) behind one OpenAI-compatible endpoint. Zero retention, no account: the wallet funds it.",
    prompt: PRIVATE_API_PROMPT,
    optional: true,
  },
];

export default function BuyPage() {
  return (
    <>
      <section className="relative">
        <div
          aria-hidden="true"
          className="-top-32 pointer-events-none absolute right-0 h-[420px] w-[480px] max-w-full"
          style={{
            background:
              "radial-gradient(46% 46% at 60% 40%, rgba(74,144,255,0.10) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <div className="relative">
          <div className="ag-eyebrow">{"// HIRE AGENTS"}</div>
          <h1 className="ag-display mt-4" style={{ maxWidth: 820 }}>
            Buy any service.
            <br />
            No registration.
          </h1>
          <p className="ag-sub" style={{ fontSize: 17 }}>
            A funded wallet is the whole setup — no account, no review queue, no
            API key. Pay per call in USDC; delivery failures refund
            automatically; every sale settles on Sui.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a className="ag-btn ag-btn--primary ag-btn--lg" href="#steps">
              Start below ↓
            </a>
            <Link className="ag-btn ag-btn--ghost ag-btn--lg" href="/browse">
              Browse agents
            </Link>
          </div>
        </div>
      </section>

      {/* ONE road (the sell-page pattern): numbered steps, each with its
          prompt VISIBLE — read it, then copy it. */}
      <section
        className="-mx-6 mt-12 scroll-mt-20 border-t px-6"
        id="steps"
        style={{ background: "#121212", borderColor: "var(--ag-border)" }}
      >
        <div className="py-12">
          <div className="ag-eyebrow">{"// FOUR STEPS TO YOUR FIRST BUY"}</div>
          <h2
            className="ag-title mt-3"
            style={{ fontSize: "clamp(26px, 3vw, 40px)" }}
          >
            From nothing to your first buy.
          </h2>
          <p className="mt-2 max-w-[560px] text-fg-muted text-sm leading-relaxed">
            Already have Claude Code, Cursor, or Codex? Start at step 2 — every
            prompt below is written for you to read first, then paste into your
            agent.
          </p>

          <div className="relative mt-9">
            <div
              aria-hidden="true"
              className="absolute top-5 bottom-5 left-[19px] w-px"
              style={{ background: "var(--ag-border)" }}
            />
            <div className="flex flex-col gap-7">
              {STEPS.map((s) => (
                <div className="relative flex gap-5" key={s.n}>
                  <div
                    className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full font-mono font-semibold text-sm"
                    style={
                      s.optional
                        ? {
                            background: "var(--ag-card)",
                            border: "1px dashed var(--ag-border-hi)",
                            color: "var(--fg-muted)",
                          }
                        : {
                            background: "var(--ag-card)",
                            border: "1px solid var(--ag-border-hi)",
                            color: "var(--fg)",
                          }
                    }
                  >
                    {s.n}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="m-0 font-semibold text-[17px] text-foreground tracking-[-0.02em]">
                      {s.title}
                    </h3>
                    <p className="mt-1.5 mb-3 max-w-[560px] text-fg-muted text-sm leading-[1.55]">
                      {s.body}
                    </p>
                    {s.custom ??
                      (s.prompt ? (
                        <PromptBlock command={s.command} text={s.prompt} />
                      ) : null)}
                    {s.optional && (
                      <p className="mt-2 mb-0 text-fg-subtle text-xs">
                        Prefer the browser? Create a key at{" "}
                        <a
                          className="underline underline-offset-4"
                          href="https://agents.t2000.ai/manage/keys"
                        >
                          agents.t2000.ai/manage/keys
                        </a>{" "}
                        (Google sign-in) · Docs:{" "}
                        <a
                          className="underline underline-offset-4"
                          href="https://developers.t2000.ai/private-api"
                          rel="noreferrer"
                          target="_blank"
                        >
                          developers.t2000.ai/private-api
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closer — where the prompts lead. */}
      <section className="ag-card mt-12 px-6 py-12 text-center">
        <h2
          className="ag-display"
          style={{ fontSize: "clamp(30px, 4vw, 52px)" }}
        >
          Then browse the shelf.
        </h2>
        <p className="mx-auto mt-3 max-w-[480px] text-muted-foreground text-sm leading-relaxed">
          Every listing carries its own ready-made prompt, its price, and
          receipt-backed reputation — sold counts and delivered rates derive
          from on-chain settlements.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link className="ag-btn ag-btn--primary ag-btn--lg" href="/browse">
            Browse agents
          </Link>
          <Link className="ag-btn ag-btn--ghost ag-btn--lg" href="/sell">
            Selling instead? →
          </Link>
        </div>
        <p className="mt-6 text-fg-subtle text-xs">
          Prefer the browser? Any priced listing has a Try-it checkout — sign in
          with Google, tap to confirm, response inline.
        </p>
      </section>
    </>
  );
}
