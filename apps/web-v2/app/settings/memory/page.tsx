/**
 * `/settings/memory` — deferral signpost.
 *
 * Per Audit-3 + Session 2 disposition: Memory settings are DEFERRED to
 * v0.7d so the rebuild can be designed against the MemWal contract once
 * it stabilizes (2026-05-29). Until then, this page renders an explainer
 * card. The legacy memory features on apps/web (`/api/user/memories` +
 * legacy panel) remain operational behind their existing routes; users
 * who need to clear remembered context can do so via the classic
 * dashboard until v0.7d ships.
 *
 * Why a v2 page (not a fallthrough): owning the `/settings/memory` URL
 * in web-v2 keeps the Vercel rewrite config uniform — every `/settings/*`
 * path goes to web-v2 — and gives us a place to disclose the deferral
 * in-product instead of silently 404ing.
 */

export default function MemoryDeferralPage() {
  return (
    <div className="flex flex-col gap-3.5">
      <p className="mb-1.5 text-[13px] text-fg-secondary">
        Audric remembers context from your conversations to give better answers
        over time.
      </p>

      <div className="rounded-md border border-border-subtle bg-surface-sunken p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">
          Memory settings — coming back in v0.7d
        </p>

        <p className="mt-3 text-[13px] leading-[1.55] text-fg-secondary">
          Memory is being rebuilt to work with{" "}
          <span className="font-mono text-fg-primary">MemWal</span>,
          Audric&rsquo;s new conversation memory layer. Once MemWal stabilizes,
          this surface will return with controls to view, edit, and clear what
          Audric remembers — without compromising the recall quality of the
          agent.
        </p>

        <p className="mt-3 text-[13px] leading-[1.55] text-fg-secondary">
          In the meantime your existing memories are{" "}
          <span className="text-fg-primary">preserved</span> and continue to
          inform answers. Nothing has been deleted.
        </p>

        <div className="mt-4 border-t border-border-subtle pt-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">
            Need to wipe memory now?
          </p>
          <p className="mt-2 text-[12px] leading-[1.5] text-fg-secondary">
            Ask Audric in chat:{" "}
            <span className="font-mono text-fg-primary">
              &ldquo;forget what you know about me&rdquo;
            </span>
            . The agent will guide you through what it remembers and what you
            can clear.
          </p>
        </div>
      </div>
    </div>
  );
}
