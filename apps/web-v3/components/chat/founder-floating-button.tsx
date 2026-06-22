"use client";

import { getCalApi } from "@calcom/embed-react";
import { CalendarIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Founder personal touch (Zinc-style floating pill) — pfp + "Book 15 min" +
 * calendar icon + dismiss. OUR own fixed button (not Cal's global floatingButton,
 * which can't scope to a page); opens the Cal modal via element-click
 * (data-cal-link → cal.com/funkii/15min). Mounted from the Settings layout, so it
 * shows only in the Settings/Billing area, never in chat.
 *
 * Avatar: drop a square photo at `public/founder.png` (falls back to initials).
 */
const DISMISS_KEY = "audric-founder-cta-dismissed";

export function FounderFloatingButton() {
  // Start hidden to avoid an SSR/first-paint flash; reveal after we've read the
  // dismiss flag on the client.
  const [hidden, setHidden] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setHidden(window.localStorage.getItem(DISMISS_KEY) === "1");
    (async () => {
      const cal = await getCalApi({ namespace: "15min" });
      cal("ui", { layout: "month_view" });
    })();
  }, []);

  if (hidden) {
    return null;
  }

  return (
    <div className="fixed right-5 bottom-5 z-50">
      <button
        aria-label="Book 15 minutes with funkii"
        className="flex items-center gap-2.5 rounded-full bg-neutral-900 py-1.5 pr-4 pl-1.5 text-white shadow-lg ring-1 ring-white/10 transition-colors hover:bg-neutral-800"
        data-cal-config='{"layout":"month_view"}'
        data-cal-link="funkii/15min"
        data-cal-namespace="15min"
        type="button"
      >
        {imgError ? (
          <span className="flex size-9 items-center justify-center rounded-full bg-neutral-700 font-semibold text-sm text-white">
            f
          </span>
        ) : (
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError swaps to the initials fallback when public/founder.png is absent
          // biome-ignore lint/performance/noImgElement: tiny static avatar — next/image config not warranted
          <img
            alt="funkii"
            className="size-9 rounded-full object-cover"
            onError={() => setImgError(true)}
            src="/founder.png"
          />
        )}
        <span className="font-medium text-sm">Book 15 min with funkii</span>
        <CalendarIcon className="size-4 opacity-80" />
      </button>

      <button
        aria-label="Dismiss"
        className="-top-2 -right-2 absolute flex size-5 items-center justify-center rounded-full bg-neutral-700 text-white shadow ring-1 ring-white/10 transition-colors hover:bg-neutral-600"
        onClick={() => {
          window.localStorage.setItem(DISMISS_KEY, "1");
          setHidden(true);
        }}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
