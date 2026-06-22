"use client";

import { getCalApi } from "@calcom/embed-react";
import { CalendarIcon } from "lucide-react";
import { useEffect } from "react";

/**
 * Founder personal touch (Zinc-style floating pill) — OUR own fixed-position
 * button (not Cal's global floatingButton API, which can't scope to a page).
 * Opens the Cal modal via element-click (data-cal-link → cal.com/funkii/15min).
 * Mounted from the Settings layout, so it shows ONLY in the Settings/Billing area
 * (high-intent / post-subscription), never in chat.
 */
export function FounderFloatingButton() {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi({ namespace: "15min" });
      cal("ui", { layout: "month_view" });
    })();
  }, []);

  return (
    <button
      aria-label="Book 15 minutes with the founder"
      className="fixed right-5 bottom-5 z-50 flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 font-medium text-background text-sm shadow-lg transition-opacity hover:opacity-90"
      data-cal-config='{"layout":"month_view"}'
      data-cal-link="funkii/15min"
      data-cal-namespace="15min"
      type="button"
    >
      <CalendarIcon className="size-4" />
      Book 15 min with funkii
    </button>
  );
}
