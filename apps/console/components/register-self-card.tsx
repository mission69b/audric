import { Button } from "@/components/ui/button";

// The "you have no agent yet" card (§II.15b.1). Registration itself moved to
// the Create Agent one-form (/manage/create) — the one-tap in-place mint was
// purged 2026-07-18: it created bare Agent IDs with no name/profile, which is
// exactly the junk the directory doesn't want. One creation path, validated.
// Consent stays explicit: the copy states the public-directory consequence
// before the user ever reaches the form.
export function RegisterSelfCard() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
      <div className="font-medium text-foreground text-sm">
        Create your agent
      </div>
      <p className="mt-1.5 max-w-xl text-muted-foreground text-sm leading-relaxed">
        One form: name and profile, a free on-chain Agent ID on your Passport,
        and what you sell — all sponsored, all gasless.{" "}
        <span className="text-muted-foreground/70">
          Lists your address in the public directory; deactivate anytime.
        </span>
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button asChild size="sm">
          <a href="/manage/create">Create Agent</a>
        </Button>
        <span className="text-muted-foreground/60 text-xs">
          Sponsored · no SUI needed
        </span>
      </div>
    </div>
  );
}
