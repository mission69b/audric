import * as WebBrowser from "expo-web-browser";

// Web hand-off — the surfaces the native app routes OUT to on audric.ai.
//
// Billing/plan MANAGEMENT lives on the web, not in-app, on purpose. A fiat card /
// Stripe subscription is "digital goods" to Apple + Google, i.e. IAP territory —
// so the native app shows plan + credit STATUS read-only and hands management off
// to audric.ai. This is the same platform-of-purchase model Claude and ChatGPT
// use (subscribe/manage on the web; the app just reflects it). Post-2025 rulings
// (Epic v. Apple; the Ninth Circuit Play injunction) now permit these external
// links on the US storefront with no commission.
//
// Crypto stablecoin top-up (USDC/USDsui → Passport) intentionally does NOT route
// here — non-custodial crypto is carved out of IAP (Apple Guideline 3.1.5(b)), so
// it stays native, which is also Audric's whole non-custodial premise.
export const AUDRIC_WEB = "https://audric.ai";

// web-v3's billing/plan hub: apps/web-v3/app/(chat)/settings/billing → /settings/billing.
export const AUDRIC_BILLING_URL = `${AUDRIC_WEB}/settings/billing`;

// Open a web surface in an in-app browser (SFSafariViewController / Chrome Custom
// Tabs) — keeps the user inside the app and is the standard, store-compliant way
// to route to an external management page. Same `expo-web-browser` the OAuth flow
// already uses (`auth/google.ts`). Fire-and-forget; the caller doesn't await.
export function openAudricWeb(url: string = AUDRIC_BILLING_URL): void {
  void WebBrowser.openBrowserAsync(url);
}
