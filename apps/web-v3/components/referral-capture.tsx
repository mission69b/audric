"use client";

import { useEffect } from "react";
import { REFERRAL_COOKIE } from "@/lib/referral/constants";

/**
 * Captures a `?ref=<code>` from any landing URL into a 30-day cookie, so the
 * code survives the Google sign-in round-trip and the session route can
 * attribute the signup. Renders nothing. See SPEC_AUDRIC_REFERRALS.md.
 */
export function ReferralCapture() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && /^[A-Za-z0-9]{4,16}$/.test(ref)) {
      const maxAge = 60 * 60 * 24 * 30; // 30 days
      // biome-ignore lint/suspicious/noDocumentCookie: document.cookie is the cross-browser path (Cookie Store API lacks Safari support)
      document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(ref)}; path=/; max-age=${maxAge}; samesite=lax`;
    }
  }, []);
  return null;
}
