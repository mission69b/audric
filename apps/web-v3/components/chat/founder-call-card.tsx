"use client";

import { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";

/**
 * Founder personal touch (Zinc-style) — scoped to the Billing page (high-intent /
 * post-subscription moment, NOT global). A "pop up via element click" Cal embed:
 * the button's data-cal-* attributes open the booking modal; getCalApi loads the
 * embed script once. cal.com/funkii/15min.
 */
export function FounderCallCard() {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi({ namespace: "15min" });
      cal("ui", { layout: "month_view" });
    })();
  }, []);

  return (
    <div className="mt-4 flex items-center justify-between rounded-2xl border border-border/50 bg-card/40 p-5">
      <div>
        <div className="font-medium text-foreground text-sm">
          Talk to the founder
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Got feedback or questions? Grab 15 minutes with funkii.
        </p>
      </div>
      <button
        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-foreground text-xs transition-colors hover:bg-accent"
        data-cal-config='{"layout":"month_view"}'
        data-cal-link="funkii/15min"
        data-cal-namespace="15min"
        type="button"
      >
        Book 15 min
      </button>
    </div>
  );
}
