import { CopyButton } from "@/components/copy-button";

// agents.t2000.ai/templates — step ③ of the developer-home restructure
// (S.732 → S.737). Every card here honors the hard rule (SPEC_INFERENCE_DEMAND
// §2c): router-wired, bills Rail 1 on first run — model t2000/auto against
// api.t2000.ai/v1, with the t2code init layer (AGENTS.md, plans/, .t2000
// privacy pin) baked in. No card exists before its template ships (earn-a-card).

export const metadata = {
  title: "Templates — t2 Agents",
  description:
    "Router-wired starters: npm create t2-app@latest. An agent worker, an AI chat app, and a Sui dApp — private by default, billing t2000/auto on first run.",
};

interface Template {
  bullets: string[];
  firstRun: string;
  id: string;
  name: string;
  tagline: string;
}

const TEMPLATES: Template[] = [
  {
    id: "agent-worker",
    name: "Agent worker",
    tagline: "The smallest useful agent — a headless TypeScript worker.",
    bullets: [
      "One router call, streamed to your terminal; grow it into a task loop or cron",
      "Prints x-t2000-served-model + route reason — every charge auditable",
      "plans/ ships the plan-expensive / execute-cheap recipe for t2code exec",
    ],
    firstRun: "npm start",
  },
  {
    id: "chat",
    name: "AI chat app",
    tagline: "Next.js streaming chat — no AI SDK, the wiring is two files.",
    bullets: [
      "Hand-written SSE relay route + ~30-line client parser you can read",
      "Your key stays server-side; the UI badge shows which model served",
      "The last 20 turns relay to t2000/auto — swap the system prompt and ship",
    ],
    firstRun: "npm run dev",
  },
  {
    id: "sui-dapp",
    name: "Sui dApp",
    tagline:
      "Wallet connect + gRPC reads + an AI copilot that knows your holdings.",
    bullets: [
      "dapp-kit ConnectButton; balance reads via SuiGrpcClient only (JSON-RPC retires)",
      "The copilot receives your address + holdings as context — explains, never signs",
      "Sui ground rules in AGENTS.md + the official Mysten skills one-liner",
    ],
    firstRun: "npm run dev",
  },
];

function scaffoldCmd(id: string): string {
  return `npm create t2-app@latest my-app -- --template ${id}`;
}

export default function TemplatesPage() {
  return (
    <section className="pt-6 pb-4">
      <div className="ag-eyebrow">{"// TEMPLATES"}</div>
      <h1
        className="ag-title mt-2"
        style={{ fontSize: "clamp(28px, 4vw, 44px)" }}
      >
        Start router-wired.
      </h1>
      <p className="mt-3 max-w-[620px] text-[14px] text-muted-foreground leading-relaxed">
        One command, no installs:{" "}
        <code className="font-mono text-foreground">
          npm create t2-app@latest
        </code>
        . Every template runs on{" "}
        <span className="font-mono text-foreground">t2000/auto</span> from its
        first run and scaffolds the agent layer — AGENTS.md for any coding
        agent, a plans/ workflow, and a per-repo privacy pin (
        <span className="font-mono">private</span> by default: open models only,
        zero data retention).
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <div className="ag-card flex flex-col gap-3 p-5" key={t.id}>
            <div className="font-mono text-[11px] text-fg-subtle">{t.id}</div>
            <div className="font-semibold text-[19px] text-foreground tracking-[-0.02em]">
              {t.name}
            </div>
            <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">
              {t.tagline}
            </p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12px] text-fg-subtle leading-relaxed">
              {t.bullets.map((b) => (
                <li className="flex gap-2" key={b}>
                  <span aria-hidden="true" className="text-foreground/40">
                    —
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div
              className="mt-auto flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              style={{ background: "#0d0d0d", borderColor: "var(--ag-border)" }}
            >
              <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
                {scaffoldCmd(t.id)}
              </code>
              <CopyButton text={scaffoldCmd(t.id)} />
            </div>
            <div className="font-mono text-[11px] text-fg-subtle">
              then: npm install ·{" "}
              <span className="text-muted-foreground">{t.firstRun}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-[620px] text-[12.5px] text-fg-subtle leading-relaxed">
        Free key at{" "}
        <a
          className="underline underline-offset-4 transition-colors hover:text-foreground"
          href="/manage"
        >
          the console
        </a>{" "}
        (<span className="font-mono">export T2000_API_KEY=sk-...</span>). Full
        options and what each scaffold contains:{" "}
        <a
          className="underline underline-offset-4 transition-colors hover:text-foreground"
          href="https://developers.t2000.ai/create-t2-app"
          rel="noreferrer"
          target="_blank"
        >
          developers.t2000.ai/create-t2-app
        </a>
        . Work on any of them privately with{" "}
        <a
          className="underline underline-offset-4 transition-colors hover:text-foreground"
          href="https://t2000.ai/code"
          rel="noreferrer"
          target="_blank"
        >
          t2 code
        </a>
        .
      </p>
    </section>
  );
}
