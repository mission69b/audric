"use client";

import { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";

/**
 * Founder personal touch (Zinc-style): a floating "Book 15 min with funkii"
 * button that opens the Cal.com booking modal. Bottom-left to stay clear of the
 * chat composer. Mounted globally from the root layout.
 */
export function FloatingCal() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cal = await getCalApi({ namespace: "15min" });
      if (cancelled) {
        return;
      }
      cal("floatingButton", {
        calLink: "funkii/15min",
        buttonText: "Book 15 min with funkii",
        buttonPosition: "bottom-left",
        buttonColor: "#0AC7B4",
        buttonTextColor: "#0A0A0A",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
