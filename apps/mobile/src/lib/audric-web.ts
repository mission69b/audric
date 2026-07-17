import * as Linking from "expo-linking";
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

// Legal / info surfaces (real web-v3 routes: app/privacy, app/terms, app/blog).
export const AUDRIC_PRIVACY_URL = `${AUDRIC_WEB}/privacy`;
export const AUDRIC_TERMS_URL = `${AUDRIC_WEB}/terms`;
export const AUDRIC_BLOG_URL = `${AUDRIC_WEB}/blog`;
// Bug report — same target as the web-v3 header dropdown (sidebar-user-nav.tsx).
export const BUG_REPORT_MAILTO = "mailto:hello@audric.ai?subject=Bug%20report";
// Developer platform (docs SSOT per the monorepo CLAUDE.md links section).
export const AUDRIC_DEVELOPERS_URL = "https://developers.t2000.ai";

// The configured Sui network (public env; safe on-device). The balance/transaction
// routes read the same var, so the explorer links below point at the same chain the
// wallet data was read from.
export const SUI_NETWORK =
  process.env.EXPO_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";

// Sui block explorer — deep-link a wallet address to its Suiscan page. Network
// segment matches the app's configured network (mainnet in prod parity).
export function suiscanAddressUrl(address: string, network = SUI_NETWORK): string {
  return `https://suiscan.xyz/${network}/account/${address}`;
}

// Suiscan deep-link for a transaction digest — the RECENT ACTIVITY rows link here.
// The digest is real (from the on-chain history route), so the link resolves.
export function suiscanTxUrl(digest: string, network = SUI_NETWORK): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

// Account-menu Help submenu → the SAME targets as web-v3's header dropdown
// (Blog/Privacy/Terms are router.push routes; Report a bug is a mailto:). Keyed by
// the exact HELP_ITEMS label so the menu stays a single source of truth.
export const HELP_LINKS: Record<string, string> = {
  Blog: AUDRIC_BLOG_URL,
  "Privacy Policy": AUDRIC_PRIVACY_URL,
  "Terms of Service": AUDRIC_TERMS_URL,
  "Report a bug": BUG_REPORT_MAILTO,
};

// Open a web surface in an in-app browser (SFSafariViewController / Chrome Custom
// Tabs) — keeps the user inside the app and is the standard, store-compliant way
// to route to an external management page. Same `expo-web-browser` the OAuth flow
// already uses (`auth/google.ts`). Fire-and-forget; the caller doesn't await.
export function openAudricWeb(url: string = AUDRIC_BILLING_URL): void {
  void WebBrowser.openBrowserAsync(url);
}

// Open any external target. http(s) opens in the in-app browser (as above); other
// schemes (mailto:, tel:) can't render there, so hand them to the OS via Linking.
export function openExternal(url: string): void {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    void WebBrowser.openBrowserAsync(url);
    return;
  }
  void Linking.openURL(url);
}
