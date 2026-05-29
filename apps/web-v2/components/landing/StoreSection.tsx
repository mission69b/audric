// [PHASE 13] Marketing — "The new app store." section.
// Split layout: left = headline / pills / stats / waitlist CTA,
// right = chat-driven creation flow mockup.
//
// CTA preserved: "Join the waitlist →" invokes `useZkLogin().login` (was the
// same in the old monolith — there's no separate waitlist endpoint yet, so
// signing in routes the user to the app where they auto-join the alpha).

"use client";

import { useZkLogin } from "@/components/auth/use-zklogin";

const PILLS = ["Music", "Art", "Ebooks", "Templates", "Courses"];

const STATS = [
  { title: "Permanent", desc: "Files on Walrus" },
  { title: "Pay-to-unlock", desc: "On-chain gating" },
  { title: "92% to you", desc: "Instant USDC" },
];

export function StoreSection() {
  const { login } = useZkLogin();

  return (
    <section className="px-8 py-20 border-t border-border" id="store">
      <div className="mx-auto max-w-[1120px] grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-foreground">
              Audric Store
            </p>
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground border border-border px-3 py-1 rounded-xs bg-card">
              Coming soon
            </span>
          </div>

          <h2 className="font-serif font-medium text-[40px] sm:text-[46px] leading-[1.02] tracking-[-0.03em] text-foreground mb-5">
            The new
            <br />
            app store.
          </h2>

          <p className="text-[16px] text-muted-foreground leading-relaxed max-w-[460px] mb-6">
            Create and sell any digital content. Get paid in USDC. No middleman.
            92% to you. Phase 5 — preview below.
          </p>

          <div className="flex gap-2.5 flex-wrap mb-6">
            {PILLS.map((pill) => (
              <span
                className="border border-border px-3.5 py-2 rounded-pill text-[13px] text-foreground"
                key={pill}
              >
                {pill}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-px rounded-xs border border-border bg-border overflow-hidden mb-6">
            {STATS.map((stat) => (
              <div className="bg-card px-4 py-4" key={stat.title}>
                <div className="font-serif font-medium text-[18px] tracking-[-0.02em] text-foreground">
                  {stat.title}
                </div>
                <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground mt-1.5">
                  {stat.desc}
                </div>
              </div>
            ))}
          </div>

          <button
            className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2.5 rounded-xs font-mono text-[11px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
            onClick={login}
            type="button"
          >
            Join the waitlist →
          </button>
        </div>

        <StoreFlowMock />
      </div>
    </section>
  );
}

function StoreFlowMock() {
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border text-[14px]">
        <div>⊙ Store</div>
        <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">
          Audric Dashboard
        </div>
      </div>

      <div className="m-4 px-3.5 py-3 bg-muted rounded-xs text-[14px] text-foreground">
        <span className="text-muted-foreground">You said:</span>
        <br />
        &ldquo;Make me a lo-fi track called Midnight Rain&rdquo;
      </div>

      <div className="px-4 grid gap-2 text-[13px] tabular-nums">
        {[
          { left: "✓ Generated lo-fi track (2:34)", right: "SUNO · $0.05" },
          { left: "✓ Created album cover", right: "DALL-E 3 · $0.04" },
          { left: "✓ Uploaded to Walrus", right: "PERMANENT" },
        ].map((row) => (
          <div className="flex justify-between" key={row.left}>
            <span className="text-foreground">{row.left}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {row.right}
            </span>
          </div>
        ))}
      </div>

      <div className="m-4 mt-5 px-3.5 py-3 bg-muted rounded-xs text-[14px] text-foreground">
        <span className="text-muted-foreground">You said:</span>
        <br />
        &ldquo;Sell this for $3&rdquo;
      </div>

      <div className="px-4 font-mono text-[11px] tracking-[0.04em] text-success mb-1.5">
        ✓ Listed on Audric Store
      </div>

      <div className="m-4 mt-2 px-3.5 py-3 border border-border rounded-xs grid gap-2 text-[13px] tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Track</span>
          <b className="font-semibold text-foreground">Midnight Rain</b>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Price</span>
          <b className="font-semibold text-foreground">$3.00 USDC</b>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">You earn</span>
          <span className="text-success font-semibold">$2.76 (92%)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Link</span>
          <span className="font-mono text-[12px] text-foreground">
            audric.ai/store/mR7k
          </span>
        </div>
      </div>

      <div aria-hidden="true" className="h-4" />
    </div>
  );
}
